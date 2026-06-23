/**
 * Handle incoming messages from Wildfire IM
 */

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WildfireConfig } from "./config.js";
// @ts-ignore - runtime may not be fully typed
import { shouldRespondToGroupMessage } from "./utils.js";
import { getClient } from "./clients.js";
import { WhitelistFilter } from "./whitelist.js";
import { pushUserSession } from "./redis-cache.js";
import { buildInboundContext } from "./inbound-context.js";

import {
  TextMessageContent,
  StreamingTextGeneratingMessageContent,
  StreamingTextGeneratedMessageContent,
  Conversation,
} from "@wildfirechat/server-sdk";
// recordInboundSession via api.runtime.channel.session (bundled env safe)

// Message type constants
const MESSAGE_TYPE_TEXT = 1;
const MESSAGE_TYPE_VOICE = 2;
const MESSAGE_TYPE_IMAGE = 3;
const MESSAGE_TYPE_VIDEO = 4;
const MESSAGE_TYPE_FILE = 5;

// Conversation type constants
const CONV_TYPE_SINGLE = 0;
const CONV_TYPE_GROUP = 1;
const CONV_TYPE_CHANNEL = 2;

// Per-session serialization: only one AI request per session may be in-flight at a time.
const sessionQueues = new Map<string, Promise<void>>();
/**
 * Process incoming message from Wildfire IM
 */
export async function handleIncomingMessage(
  api: any,
  message: any,
  config: WildfireConfig,
  accountId: string,
): Promise<void> {
  const runtime = api.runtime;
  if (!runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    api.logger?.warn?.("[wildfire] runtime.channel.reply not available");
    return;
  }

  const data = message.data;
  if (!data) return;

  // Debug logging (config-driven)
  if (config.debug) {
    try {
      api.logger?.info?.(
        `[wildfire:${accountId}] ⬇ RECV data=${JSON.stringify(data)}`,
      );
    } catch {}
  }

  // Push session data to Redis (best-effort, config-driven)
  pushUserSession(config, data).catch((err: any) =>
    api.logger?.warn?.(`[wildfire] redis cache push failed: ${err.message}`),
  );

  const sender = data.sender;
  const conv = data.conv;
  const payload = data.payload;

  if (!sender || !conv || !payload) return;

  // Skip non-content messages
  const payloadType = payload.type;
  if (payloadType <= 0 || (payloadType > 15 && payloadType < 100) || payloadType > 200) {
    return;
  }

  const isGroup = conv.type === CONV_TYPE_GROUP || conv.type === CONV_TYPE_CHANNEL;
  const { text, mediaUrl, extra } = extractPayloadInfo(payload);

  api.logger?.info?.(
    `[wildfire-inbound] message received: sender=${sender}, convType=${conv.type}, target=${conv.target}, payloadType=${payloadType}, textPreview=${safePreview(text)}, mediaUrl=${mediaUrl || ""}`
  );
  api.logger?.debug?.(
    `[wildfire-inbound] payload snapshot: ${JSON.stringify({
      type: payload?.type,
      searchableContent: payload?.searchableContent,
      content: payload?.content,
      remoteMediaUrl: payload?.remoteMediaUrl,
      mediaUrl: payload?.mediaUrl,
      remoteUrl: payload?.remoteUrl,
      url: payload?.url,
      extra: payload?.extra,
      duration: payload?.duration,
      keys: Object.keys(payload || {}),
    })}`
  );

  // Check if should respond (group filtering)
  if (
    isGroup &&
    !shouldRespondToGroupMessage(
      text,
      data,
      config.robotId,
      config.requireMention,
      config.helpKeywords,
    )
  ) {
    return;
  }

  // Check whitelist
  const whitelistFilter = new WhitelistFilter(config);
  if (!whitelistFilter.shouldProcess(String(sender), String(conv.target), isGroup)) {
    api.logger?.info?.(`[wildfire] message from ${sender} blocked by whitelist`);
    // Send denied message
    try {
      const deniedMessage = config.whiteList?.deniedMessage || "不允许使用";
      await sendDirectReply(sender, conv, deniedMessage, accountId, extra, api);
    } catch (e: any) {
      api.logger?.error?.(`[wildfire] failed to send denied message: ${e.message}`);
    }
    return;
  }

  const tenantId = resolveTenantId(data, config.tenantIdPath) || "default";
  const tenantName = config.tenantNamePath
    ? resolveTenantId(data, config.tenantNamePath)
    : null;

  const baseSessionKey = isGroup
    ? `wildfire:group:${tenantId}:${conv.target}`.toLowerCase()
    : `wildfire:user:${tenantId}:${sender}`.toLowerCase();

  const cfg = api.config;
  const routePeer = isGroup
    ? { kind: "group" as const, id: `${tenantId}:${conv.target}` }
    : { kind: "direct" as const, id: `${tenantId}:${sender}` };

  const route =
    runtime.channel.routing?.resolveAgentRoute?.({
      cfg,
      channel: "wildfire",
      accountId,
      peer: routePeer,
    }) ?? { agentId: "main", sessionKey: baseSessionKey };

  const sessionKey = String(route?.sessionKey ?? baseSessionKey).trim() || baseSessionKey;

  // Wait for any in-flight request on this session to finish before starting a new one.
  const prevRequest = sessionQueues.get(sessionKey) ?? Promise.resolve();
  let releaseSession!: () => void;
  const sessionSlot = new Promise<void>(resolve => { releaseSession = resolve; });
  sessionQueues.set(sessionKey, sessionSlot);
  await prevRequest.catch(() => {});
  let mediaTempPath: string | undefined;
  try {
    const storePath =
      runtime.channel.session?.resolveStorePath?.(cfg?.session?.store, {
        agentId: route.agentId,
      }) ?? "";

    const chatType = isGroup ? "group" : "direct";
    const senderUserInfo = data.senderUserInfo ?? null;
    const fromLabel = senderUserInfo?.displayName || senderUserInfo?.name || String(sender);
    const conversationLabel = isGroup ? `group:${conv.target}` : `user:${sender}`;
    const senderId = String(sender);
    const timestamp = data.timestamp ?? Date.now();
    const asrServer = resolveAsrServer(config);

  // 生成唯一的 streamId 用于流式消息（每条用户消息有独立的流）
  const streamId = `stream-${randomUUID()}`;
  let finalText = "";
  let hasCompleted = false;

  // 先发送一个空的 generating 消息显示转圈等待，让客户端立即看到响应
  try {
    await sendStreamingReply(sender, conv, "...", streamId, "generating", accountId, extra, api);
  } catch (e: any) {
    api.logger?.error?.(`[wildfire] initial stream failed: ${e.message}`);
  }

    let transcript: string | undefined;
    if (payloadType === MESSAGE_TYPE_VOICE && mediaUrl && asrServer) {
      transcript = await transcribeWithAsrServer({
        asrServer,
        mediaUrl,
        logger: api.logger,
      });
      if (transcript) {
        api.logger?.info?.(
          `[wildfire-inbound] ASR transcript ready: len=${transcript.length}, preview=${safePreview(transcript)}`
        );
      } else {
        api.logger?.warn?.("[wildfire-inbound] ASR transcript empty, fallback to voice placeholder text");
      }
    }

    const bodyText = transcript || text;

    const ctxPayload = await buildInboundContext(api, {
      bodyText,
      isGroup,
      sender,
      conv,
      sessionKey,
      accountId,
      chatType,
      conversationLabel,
      fromLabel,
      senderId,
      timestamp,
      tenantId,
      tenantName,
      senderUserInfo,
      extra,
      config,
      route,
      transcript,
      mediaUrl,
    });

    if (transcript) {
      ctxPayload.Transcript = transcript;
    }

  // Download remote media to a local temp file so openclaw can read it via MediaPath.
  // openclaw expects MediaPath to be a local filesystem path, not a remote URL.
  const shouldDownloadMedia = Boolean(mediaUrl) && !(payloadType === MESSAGE_TYPE_VOICE && transcript);
  if (shouldDownloadMedia && mediaUrl) {
    const downloaded = await downloadMediaToTemp(mediaUrl, payloadType, api.logger);
    if (downloaded) {
      mediaTempPath = downloaded.localPath;
      ctxPayload.MediaPath = downloaded.localPath;
      ctxPayload.MediaUrl = downloaded.localPath;   // legacy alias — must equal MediaPath
      ctxPayload.MediaType = downloaded.contentType;
      api.logger?.info?.(
        `[wildfire-inbound] media downloaded: remoteUrl=${mediaUrl}, localPath=${downloaded.localPath}, contentType=${downloaded.contentType}`
      );
    } else {
      api.logger?.warn?.(`[wildfire-inbound] media download failed, dispatching without media: remoteUrl=${mediaUrl}`);
    }
  }

  if (payloadType === MESSAGE_TYPE_VOICE && !asrServer) {
    api.logger?.debug?.("[wildfire-inbound] asrServer not configured; skip speech-to-text");
  }

  api.logger?.info?.(
    `[wildfire-inbound] dispatch ctx: sessionKey=${sessionKey}, bodyPreview=${safePreview(String(ctxPayload.Body || ""))}, MediaPath=${ctxPayload.MediaPath || ""}, MediaType=${ctxPayload.MediaType || ""}`
  );
  api.logger?.debug?.(
    `[wildfire-inbound] dispatch ctx keys: ${Object.keys(ctxPayload).join(",")}`
  );

  api.logger?.info?.("[wildfire-debug] BEFORE recordInboundSession: storePath="+storePath+" sessionKey="+sessionKey+" hasCtx="+Boolean(ctxPayload)+" hasApi="+Boolean(api?.runtime?.channel?.session?.recordInboundSession));

  // Record session via api.runtime — bypasses runtime.channel.session)
  try {
    await api.runtime.channel.session.recordInboundSession({
      storePath,
      sessionKey,
      ctx: ctxPayload,
      updateLastRoute: !isGroup
        ? { sessionKey, channel: 'wildfire', to: 'wildfire:user:'+senderId, accountId }
        : undefined,
      onRecordError: (err: any) => api.logger?.warn?.('[wildfire] recordInboundSession: '+String(err)),
    });
  } catch (e: any) { api.logger?.warn?.('[wildfire] recordInboundSession failed: '+e.message); }
  // Record activity
  if (runtime.channel.activity?.record) {
    runtime.channel.activity.record({
      channel: "wildfire",
      accountId,
      direction: "inbound",
    });
  }

  // Dispatch to OpenClaw - 使用真正的流式回复（onPartialReply）
  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        // deliver is called once per block (paragraph) with that block's text only — NOT cumulative.
        deliver: async (_payload: { text?: string }) => {
          // no-op: streaming delivery is handled via onPartialReply + sendStreamingReply
        },
        onError: (err: unknown, info: { kind?: string }) => {
          api.logger?.error?.(`[wildfire] ${info?.kind || "reply"} failed: ${String(err)}`);
        },
      },
      replyOptions: {
        disableBlockStreaming: false,
        // 真正的流式回调：每次生成新内容时触发
        onPartialReply: async (payload: { text?: string }) => {
          if (!payload.text) return;
          
          // 更新最终文本
          finalText = payload.text;
          
          api.logger?.debug?.(`[wildfire-debug] onPartialReply: ${payload.text.substring(0, 30)}...`);

          try {
            // 发送 generating 消息更新同一条消息
            await sendStreamingReply(sender, conv, payload.text, streamId, "generating", accountId, extra, api);
          } catch (e: any) {
            api.logger?.error?.(`[wildfire] stream update failed: ${e.message}`);
          }
        },
      },
    });

    // 流式完成，发送 completed 消息
    if (!hasCompleted) {
      hasCompleted = true;
      api.logger?.debug?.(`[wildfire-debug] stream completed, text=${finalText?.substring(0, 30)}`);
      
      // 如果有内容就发送 completed，否则发送错误提示
      const textToSend = finalText || "(no response)";
      await sendStreamingReply(sender, conv, textToSend, streamId, "completed", accountId, extra, api);
    }
  } catch (err: any) {
    api.logger?.error?.(`[wildfire] dispatch failed: ${err.message}`);
    try {
      const errorText = `Processing failed: ${err.message.slice(0, 80)}`;
      await sendStreamingReply(sender, conv, errorText, streamId, "completed", accountId, extra, api);
    } catch {
      // ignore secondary send errors
    }
  }

  } finally {
    releaseSession();
    if (sessionQueues.get(sessionKey) === sessionSlot) {
      sessionQueues.delete(sessionKey);
    }
    if (mediaTempPath) {
      unlink(mediaTempPath).catch((e: any) =>
        api.logger?.warn?.(`[wildfire-inbound] temp file cleanup failed: ${e.message}`)
      );
    }
  }
}
/**
 * Send streaming reply back to Wildfire IM
 * 
 * 流式消息分为三种状态：
 * - start: 流式开始，发送首段内容
 * - generating: 流式生成中，发送增量内容
 * - completed: 流式完成，发送最终完整内容
 */
async function sendStreamingReply(
  sender: string,
  conv: { type: number; target: string; line: number },
  text: string,
  streamId: string,
  state: "start" | "generating" | "completed",
  accountId: string,
  extra?: Record<string, unknown> | null,
  api?: any,
): Promise<void> {
  if (api?.config?.channels?.wildfire?.debug) {
    api?.logger?.info?.(
      `[wildfire:${accountId}] ⬆ SEND streaming | ${state} | ${text?.substring(0, 100)}`,
    );
  }
  const client = getClient(accountId);
  if (!client) {
    api?.logger?.error?.("[wildfire-debug] client not connected");
    throw new Error("Wildfire client not connected");
  }

  const conversation: Conversation = {
    type: conv.type,
    target: conv.type === 0 ? sender : conv.target,
    line: conv.line,
  };

  let payload;
  if (state === "generating" || state === "start") {
    // 流式生成中 - 使用 StreamingTextGeneratingMessageContent
    const generatingContent = new StreamingTextGeneratingMessageContent();
    generatingContent.text = text;
    generatingContent.streamId = streamId;
    payload = generatingContent.encode();
  } else if (state === "completed") {
    // 流式生成完成 - 使用 StreamingTextGeneratedMessageContent
    const generatedContent = new StreamingTextGeneratedMessageContent();
    generatedContent.text = text;
    generatedContent.streamId = streamId;
    payload = generatedContent.encode();
  } else {
    // 其他情况使用普通文本消息
    const textContent = new TextMessageContent();
    textContent.content = text;
    payload = textContent.encode();
  }

  // Inject custom extra headers into the outgoing payload
  if (extra) {
    payload.extra = JSON.stringify(extra);
  }

  api?.logger?.debug?.(`[wildfire-debug] sending streaming message: state=${state}, streamId=${streamId}`);

  try {
    const result = await client.sendMessage(conversation, payload);
    api?.logger?.debug?.(`[wildfire-debug] sendMessage result: success=${result.isSuccess()}, msg=${result.getMsg()}`);

    if (!result.isSuccess()) {
      throw new Error(result.getMsg());
    }
    api?.logger?.debug?.(`[wildfire-debug] streaming message sent successfully`);
  } catch (e: any) {
    api?.logger?.error?.(`[wildfire-debug] sendMessage error: ${e.message}`);
    throw e;
  }
}

/**
 * Parse payload.extra JSON string safely
 */
function parseExtra(raw?: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Extract text, optional media URL, and custom extra from payload
 */
function extractPayloadInfo(payload: any): {
  text: string;
  mediaUrl?: string;
  extra: Record<string, unknown> | null;
} {
  const mediaUrl = pickMediaUrl(payload);
  const extra = parseExtra(payload?.extra);

  switch (payload.type) {
    case MESSAGE_TYPE_TEXT:
      return { text: payload.searchableContent || payload.content || "", extra };
    case MESSAGE_TYPE_VOICE: {
      const duration = payload.duration ? ` ${payload.duration}s` : "";
      return { text: `[语音${duration}]`, mediaUrl, extra };
    }
    case MESSAGE_TYPE_IMAGE:
      return { text: "[图片]", mediaUrl, extra };
    case MESSAGE_TYPE_VIDEO:
      return { text: "[视频]", mediaUrl, extra };
    case MESSAGE_TYPE_FILE:
      return { text: `[文件] ${payload.searchableContent || ""}`, mediaUrl, extra };
    default:
      return { text: `[消息类型:${payload.type}]`, extra };
  }
}

function pickMediaUrl(payload: any): string | undefined {
  const candidates = [
    payload?.remoteMediaUrl,
    payload?.mediaUrl,
    payload?.remoteUrl,
    payload?.url,
  ];

  const normalized = candidates
    .map(v => (typeof v === "string" ? v.trim() : ""))
    .find(v => !!v);

  return normalized || undefined;
}

function resolveTenantId(data: any, path?: string): string | null {
  const fullPath = path || "payload.extra.tenantId";
  // Walk to the parent of the last segment (the JSON string field)
  const segments = fullPath.split(".");
  const field = segments.pop()!;
  const jsonStr = segments.reduce((obj: any, key) => obj?.[key], data);
  if (!jsonStr || typeof jsonStr !== "string") return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed?.[field] || null;
  } catch {
    return null;
  }
}

function safePreview(value: string, maxLen = 120): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen)}...`;
}

function resolveAsrServer(config: WildfireConfig): string | undefined {
  const asr = config.asrServer;
  if (!asr || typeof asr !== "string") return undefined;
  const trimmed = asr.trim();
  return trimmed || undefined;
}

async function transcribeWithAsrServer(params: {
  asrServer: string;
  mediaUrl: string;
  logger?: any;
}): Promise<string | undefined> {
  try {
    const res = await fetch(params.asrServer, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
      },
      body: JSON.stringify({
        url: params.mediaUrl,
        noReuse: false,
        noLlm: false,
      }),
    });

    if (!res.ok) {
      params.logger?.warn?.(`[wildfire-inbound] ASR request failed: status=${res.status}`);
      return undefined;
    }

    if (!res.body) {
      const plainText = (await res.text()).trim();
      return plainText || undefined;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let result = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r\n|\n|\r/g);
      pending = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data:")) {
          result += trimmed.slice(5).trim();
        } else {
          result += trimmed;
        }
      }
    }

    if (pending.trim()) {
      const tail = pending.trim();
      result += tail.startsWith("data:") ? tail.slice(5).trim() : tail;
    }

    const cleaned = result.trim();
    return cleaned || undefined;
  } catch (e: any) {
    params.logger?.warn?.(`[wildfire-inbound] ASR request error: ${e.message}`);
    return undefined;
  }
}

/** Maps a remote media URL to a best-guess MIME type using the URL extension. */
function mimeFromUrl(url: string, payloadType: number): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    amr: "audio/amr",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    opus: "audio/opus",
    aac: "audio/aac",
    wav: "audio/wav",
    flac: "audio/flac",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
  };
  if (map[ext]) return map[ext];
  if (payloadType === MESSAGE_TYPE_VOICE) return "audio/amr";
  if (payloadType === MESSAGE_TYPE_IMAGE) return "image/jpeg";
  if (payloadType === MESSAGE_TYPE_VIDEO) return "video/mp4";
  return "application/octet-stream";
}

/**
 * Download a remote media URL to /tmp/openclaw/ so openclaw can access it as a local file.
 * openclaw's MediaPath must be a local filesystem path in an allowed root directory.
 */
async function downloadMediaToTemp(
  remoteUrl: string,
  payloadType: number,
  logger?: any
): Promise<{ localPath: string; contentType: string } | undefined> {
  try {
    const tmpDir = "/tmp/openclaw";
    await mkdir(tmpDir, { recursive: true });

    const urlPath = remoteUrl.split("?")[0];
    const ext = urlPath.split(".").pop()?.toLowerCase() ?? "bin";
    const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
    const localPath = path.join(tmpDir, `wildfire-${randomUUID()}.${safeExt}`);

    const resp = await fetch(remoteUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    await writeFile(localPath, buf);

    const contentType =
      resp.headers.get("content-type")?.split(";")[0].trim() ||
      mimeFromUrl(remoteUrl, payloadType);

    return { localPath, contentType };
  } catch (e: any) {
    logger?.warn?.(`[wildfire-inbound] downloadMediaToTemp failed for ${remoteUrl}: ${e.message}`);
    return undefined;
  }
}

/**
 * Send direct reply back to Wildfire IM (for whitelist rejection, etc.)
 */
async function sendDirectReply(
  sender: string,
  conv: { type: number; target: string; line: number },
  text: string,
  accountId: string,
  extra?: Record<string, unknown> | null,
  api?: any,
): Promise<void> {
  if (api?.config?.channels?.wildfire?.debug) {
    api?.logger?.info?.(`[wildfire:${accountId}] ⬆ SEND direct | ${text?.substring(0, 100)}`);
  }
  const client = getClient(accountId);
  if (!client) {
    api?.logger?.error?.("[wildfire-debug] client not connected");
    throw new Error("Wildfire client not connected");
  }

  const conversation: Conversation = {
    type: conv.type,
    target: conv.type === 0 ? sender : conv.target,
    line: conv.line,
  };

  api?.logger?.debug?.(`[wildfire-debug] sendDirectReply conversation: type=${conv.type}, target=${conversation.target}, line=${conv.line}`);

  const content = new TextMessageContent();
  content.content = text;

  const payload = content.encode();
  if (extra) {
    payload.extra = JSON.stringify(extra);
  }

  try {
    const result = await client.sendMessage(conversation, payload);
    api?.logger?.debug?.(`[wildfire-debug] sendDirectReply result: success=${result.isSuccess()}, msg=${result.getMsg()}`);
    
    if (!result.isSuccess()) {
      throw new Error(result.getMsg());
    }
    api?.logger?.debug?.(`[wildfire-debug] direct reply sent successfully`);
  } catch (e: any) {
    api?.logger?.error?.(`[wildfire-debug] sendDirectReply error: ${e.message}`);
    throw e;
  }
}

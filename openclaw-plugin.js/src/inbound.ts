/**
 * Handle incoming messages from Wildfire IM
 */

import type { WildfireConfig } from "./config.js";
// @ts-ignore - runtime may not be fully typed
import { shouldRespondToGroupMessage } from "./utils.js";
import { getClient } from "./clients.js";
import {
  TextMessageContent,
  StreamingTextGeneratingMessageContent,
  StreamingTextGeneratedMessageContent,
  Conversation,
} from "@wildfirechat/server-sdk";

// Message type constants
const MESSAGE_TYPE_TEXT = 1;
const MESSAGE_TYPE_IMAGE = 3;
const MESSAGE_TYPE_VIDEO = 4;
const MESSAGE_TYPE_FILE = 5;

// Conversation type constants
const CONV_TYPE_SINGLE = 0;
const CONV_TYPE_GROUP = 1;
const CONV_TYPE_CHANNEL = 2;

/**
 * Process incoming message from Wildfire IM
 */
export async function handleIncomingMessage(
  api: any,
  message: any,
  config: WildfireConfig
): Promise<void> {
  const runtime = api.runtime;
  if (!runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    api.logger?.warn?.("[wildfire] runtime.channel.reply not available");
    return;
  }

  const data = message.data;
  if (!data) return;

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
  const text = extractTextContent(payload);

  // Check if should respond (group filtering)
  if (isGroup && !shouldRespondToGroupMessage(text, data, config)) {
    return;
  }

  const baseSessionKey = isGroup
    ? `wildfire:group:${conv.target}`.toLowerCase()
    : `wildfire:${sender}`.toLowerCase();

  const cfg = api.config;

  const route =
    runtime.channel.routing?.resolveAgentRoute?.({
      cfg,
      sessionKey: baseSessionKey,
      channel: "wildfire",
      accountId: "default",
    }) ?? { agentId: "main", sessionKey: baseSessionKey };

  const sessionKey = String(route?.sessionKey ?? baseSessionKey).trim() || baseSessionKey;

  const storePath =
    runtime.channel.session?.resolveStorePath?.(cfg?.session?.store, {
      agentId: route.agentId,
    }) ?? "";

  const chatType = isGroup ? "group" : "direct";
  const fromLabel = String(sender);
  const senderId = String(sender);
  const timestamp = Date.now();

  const ctxPayload = {
    Body: text,
    RawBody: text,
    From: `wildfire:user:${sender}`,
    To: isGroup ? `wildfire:group:${conv.target}` : `wildfire:user:${sender}`,
    SessionKey: sessionKey,
    AccountId: "default",
    ChatType: chatType,
    ConversationLabel: fromLabel,
    SenderName: fromLabel,
    SenderId: senderId,
    Provider: "wildfire",
    Surface: "wildfire",
    MessageSid: `wildfire-${Date.now()}`,
    Timestamp: timestamp,
    OriginatingChannel: "wildfire",
    OriginatingTo: `wildfire:${config.robotId || "bot"}`,
    CommandAuthorized: true,
    _wildfire: {
      accountId: "default",
      isGroup,
      senderId,
      conversationId: conv.target,
      messageType: payloadType,
    },
  };

  // Record session
  if (runtime.channel.session?.recordInboundSession) {
    await runtime.channel.session.recordInboundSession({
      storePath,
      sessionKey,
      ctx: ctxPayload,
      updateLastRoute: !isGroup
        ? {
            sessionKey,
            channel: "wildfire",
            to: senderId,
            accountId: "default",
          }
        : undefined,
      onRecordError: (err: unknown) =>
        api.logger?.warn?.(`[wildfire] recordInboundSession: ${String(err)}`),
    });
  }

  // Record activity
  if (runtime.channel.activity?.record) {
    runtime.channel.activity.record({
      channel: "wildfire",
      accountId: "default",
      direction: "inbound",
    });
  }

  // 生成唯一的 streamId 用于流式消息（每条用户消息有独立的流）
  const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let finalText = "";
  let hasStarted = false;
  let hasCompleted = false;

  // 先发送一个空的 generating 消息显示转圈等待
  try {
    await sendStreamingReply(sender, conv, "...", streamId, "generating", api);
    hasStarted = true;
  } catch (e: any) {
    api.logger?.error?.(`[wildfire] initial stream failed: ${e.message}`);
  }

  // Dispatch to OpenClaw - 使用真正的流式回复（onPartialReply）
  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver: async (payload: { text?: string }) => {
          // deliver 接收最终完整内容
          if (payload.text) {
            finalText = payload.text;
          }
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
            await sendStreamingReply(sender, conv, payload.text, streamId, "generating", api);
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
      await sendStreamingReply(sender, conv, textToSend, streamId, "completed", api);
    }
  } catch (err: any) {
    api.logger?.error?.(`[wildfire] dispatch failed: ${err.message}`);
    try {
      const errorText = `Processing failed: ${err.message.slice(0, 80)}`;
      await sendStreamingReply(sender, conv, errorText, streamId, "completed", api);
    } catch {
      // ignore secondary send errors
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
  api?: any
): Promise<void> {
  api?.logger?.debug?.(`[wildfire-debug] sendStreamingReply called, state=${state}, text=${text?.substring(0, 30)}`);
  const client = getClient();
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
 * Send reply back to Wildfire IM
 */
async function sendReply(
  sender: string,
  conv: { type: number; target: string; line: number },
  text: string,
  api?: any
): Promise<void> {
  api?.logger?.debug?.(`[wildfire-debug] sendReply called, text=${text?.substring(0, 30)}`);
  const client = getClient();
  if (!client) {
    api?.logger?.error?.("[wildfire-debug] client not connected");
    throw new Error("Wildfire client not connected");
  }

  const conversation: Conversation = {
    type: conv.type,
    target: conv.type === 0 ? sender : conv.target,
    line: conv.line,
  };

  api?.logger?.debug?.(`[wildfire-debug] conversation: type=${conv.type}, target=${conversation.target}, line=${conv.line}`);

  const content = new TextMessageContent();
  content.content = text;

  api?.logger?.debug?.(`[wildfire-debug] content encoded, sending...`);
  
  try {
    const result = await client.sendMessage(conversation, content.encode());
    api?.logger?.debug?.(`[wildfire-debug] sendMessage result: success=${result.isSuccess()}, msg=${result.getMsg()}`);
    
    if (!result.isSuccess()) {
      throw new Error(result.getMsg());
    }
    api?.logger?.debug?.(`[wildfire-debug] message sent successfully`);
  } catch (e: any) {
    api?.logger?.error?.(`[wildfire-debug] sendMessage error: ${e.message}`);
    throw e;
  }
}

/**
 * Extract text content from payload
 */
function extractTextContent(payload: any): string {
  switch (payload.type) {
    case MESSAGE_TYPE_TEXT:
      return payload.searchableContent || payload.content || "";
    case MESSAGE_TYPE_IMAGE:
      return "[图片]";
    case MESSAGE_TYPE_VIDEO:
      return "[视频]";
    case MESSAGE_TYPE_FILE:
      return `[文件] ${payload.searchableContent || ""}`;
    default:
      return `[消息类型:${payload.type}]`;
  }
}

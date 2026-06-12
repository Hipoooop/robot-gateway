/**
 * OpenClaw Channel Plugin implementation for Wildfire IM
 */

import { getConnectedClient } from "./clients.js";

import { parseTarget } from "./targets.js";
import {
  TextMessageContent,
  ImageMessageContent,
  VideoMessageContent,
  FileMessageContent,
} from "@wildfirechat/server-sdk";
import { readFileSync } from "fs";

export const WildfireChannelPlugin = {
  id: "wildfire",

  meta: {
    id: "wildfire",
    label: "Wildfire IM",
    selectionLabel: "Wildfire IM",
    docsPath: "/channels/wildfire",
    blurb: "Wildfire IM protocol channel via @wildfirechat/robot-gateway-client-sdk",
    aliases: ["wildfire", "wf"],
  },

  capabilities: {
    chatTypes: ["direct", "group"],
  },

  config: {
    // Multi-account: enumerate all configured account IDs
    listAccountIds: (cfg: any) => {
      const wildfireCfg = cfg?.channels?.wildfire;
      if (!wildfireCfg || wildfireCfg.enabled === false) return [];

      // If multi-account config exists, return its keys
      if (wildfireCfg.accounts && typeof wildfireCfg.accounts === "object") {
        return Object.keys(wildfireCfg.accounts).filter(
          (id: string) => wildfireCfg.accounts[id]?.enabled !== false,
        );
      }

      // Legacy single-account config
      return ["default"];
    },

    // Resolve merged account config with top-level fallback
    resolveAccount: (cfg: any, accountId?: string | null) => {
      const id = accountId || "default";
      const wildfireCfg = cfg?.channels?.wildfire;
      if (!wildfireCfg) return null;

      // If multi-account: merge account-level over top-level defaults
      if (wildfireCfg.accounts?.[id]) {
        const account = wildfireCfg.accounts[id];
        if (account.enabled === false) return null;
        return {
          ...wildfireCfg,
          ...account,
          accounts: wildfireCfg.accounts, // preserve accounts map
          gatewayUrl: account.gatewayUrl ?? wildfireCfg.gatewayUrl,
          robotId: account.robotId ?? wildfireCfg.robotId,
          robotSecret: account.robotSecret ?? wildfireCfg.robotSecret,
          asrServer: account.asrServer ?? wildfireCfg.asrServer,
          requireMention:
            account.requireMention ?? wildfireCfg.requireMention ?? true,
          helpKeywords:
            account.helpKeywords ?? wildfireCfg.helpKeywords ?? "帮,请,分析,总结",
        };
      }

      // Legacy: return top-level config for "default" only
      if (id === "default") {
        if (wildfireCfg.enabled === false) return null;
        return wildfireCfg;
      }

      return null;
    },
  },

  messaging: {
    normalizeTarget: (raw: string) => {
      // Remove wildfire: prefix and return normalized target
      const normalized = raw.replace(/^(wildfire|wf):/i, "");
      return normalized || undefined;
    },
    targetResolver: {
      looksLikeId: (raw: string, normalized?: string) => {
        const value = (normalized ?? raw).trim();
        if (!value) return false;
        
        // Accept explicit user: or group: prefixes
        if (/^(user|group):/i.test(value)) {
          const id = value.replace(/^(user|group):/i, "");
          // Reject bot targets
          if (id === "bot" || id.startsWith("robot_")) return false;
          return id.length > 0;
        }
        
        // Reject bot targets for bare IDs too
        if (value === "bot" || value.startsWith("robot_")) return false;
        
        // Accept any non-empty string as potential Wildfire ID
        return value.length > 0;
      },
      hint: "<user:userId|group:groupId|userId|groupId>",
    },
  },

  outbound: {
    deliveryMode: "direct" as const,

    resolveTarget: ({ to }: { to?: string }) => {
      console.log(`[wildfire] resolveTarget called with to=${to}`);
      if (!to) {
        return { ok: false, error: new Error("Wildfire requires --to <userId|groupId>") };
      }
      
      // 解析并验证 target
      const target = parseTarget(to);
      if (!target) {
        return { ok: false, error: new Error(`Invalid target format: ${to}`) };
      }
      
      // 排除无效的目标（如 wildfire:bot 或 wildfire:robot_xxx）
      if (!target.id || target.id === "bot" || target.id.startsWith("robot_")) {
        return { ok: false, error: new Error(`Invalid target: ${to} (cannot send to bot itself)`) };
      }
      
      // 返回规范化的格式
      const normalizedTo = target.isGroup ? `group:${target.id}` : `user:${target.id}`;
      return { ok: true, to: normalizedTo };
    },

    sendText: async ({
      to,
      text,
      accountId,
      extra,
    }: {
      to: string;
      text: string;
      accountId?: string;
      extra?: string;
    }) => {
      console.log(`[wildfire] sendText called: to=${to}, text=${text?.substring(0, 50)}`);
      
      const client = getConnectedClient(accountId);
      if (!client) {
        console.error("[wildfire] client not found");
        return { ok: false, error: new Error("Wildfire not connected") };
      }
      
      console.log(`[wildfire] client found, connected=${client.isConnected?.()}`);

      const target = parseTarget(to);
      if (!target) {
        console.error(`[wildfire] invalid target: ${to}`);
        return { ok: false, error: new Error("invalid target") };
      }
      
      console.log(`[wildfire] target parsed: id=${target.id}, isGroup=${target.isGroup}`);

      try {
        const conversation = {
          type: target.isGroup ? 1 : 0,
          target: target.id,
          line: 0,
        };

        const content = new TextMessageContent();
        content.content = text;

        const payload = content.encode();
        if (extra) {
          payload.extra = extra;
        }

        console.log(`[wildfire] sending message...`);
        const result = await client.sendMessage(conversation, payload);
        console.log(`[wildfire] send result: success=${result.isSuccess()}, msg=${result.getMsg?.()}`);

        if (!result.isSuccess()) {
          return { ok: false, error: new Error(result.getMsg()) };
        }

        return { ok: true, provider: "wildfire" };
      } catch (e: any) {
        console.error(`[wildfire] send error:`, e);
        return { ok: false, error: new Error(e.message) };
      }
    },

    sendMedia: async (ctx: any) => {
      const { to, mediaUrl, text, accountId, extra } = ctx;
      console.log(`[wildfire] sendMedia called: to=${to}, mediaUrl=${mediaUrl}`);
      
      if (!mediaUrl) {
        console.error(`[wildfire] mediaUrl is required`);
        return { ok: false, error: new Error("mediaUrl is required") };
      }
      
      const client = getConnectedClient(accountId);
      if (!client) {
        console.error(`[wildfire] client not connected`);
        return { ok: false, error: new Error("Wildfire not connected") };
      }
      console.log(`[wildfire] client connected: ${client.isConnected?.()}`);

      const target = parseTarget(to);
      if (!target) {
        console.error(`[wildfire] invalid target: ${to}`);
        return { ok: false, error: new Error("invalid target") };
      }
      console.log(`[wildfire] target parsed: id=${target.id}, isGroup=${target.isGroup}`);

      try {
        const conversation = {
          type: target.isGroup ? 1 : 0,
          target: target.id,
          line: 0,
        };

        let remoteUrl: string;
        let fileName: string;
        let fileSize: number = 0;

        // Check if it's a local file path or remote URL
        if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
          // Remote URL - use directly
          console.log(`[wildfire] using remote URL`);
          remoteUrl = mediaUrl;
          fileName = mediaUrl.split('/').pop()?.split('?')[0] || "file";
          console.log(`[wildfire] fileName: ${fileName}`);
        } else {
          // Local file - upload to Wildfire server
          console.log(`[wildfire] local file path detected: ${mediaUrl}`);
          fileName = mediaUrl.split('/').pop() || "file";
          console.log(`[wildfire] fileName: ${fileName}`);
          
          // Read file as Buffer
          console.log(`[wildfire] reading file...`);
          let fileData: Buffer;
          try {
            fileData = readFileSync(mediaUrl);
            fileSize = fileData.length;
            console.log(`[wildfire] file read success, size=${fileSize} bytes`);
          } catch (readErr: any) {
            console.error(`[wildfire] file read failed: ${readErr.message}`);
            return { ok: false, error: new Error(`Failed to read file: ${readErr.message}`) };
          }
          
          // Upload file
          console.log(`[wildfire] uploading file with name=${fileName}...`);
          let uploadResult: any;
          try {
            uploadResult = await client.uploadFile(fileData, fileName, 4, 'application/octet-stream');
            console.log(`[wildfire] uploadFile returned: code=${uploadResult?.getCode?.()}, msg=${uploadResult?.getMsg?.()}`);
          } catch (uploadErr: any) {
            console.error(`[wildfire] uploadFile threw error: ${uploadErr.message}`);
            return { ok: false, error: new Error(`Upload error: ${uploadErr.message}`) };
          }
          
          if (!uploadResult.isSuccess()) {
            console.error(`[wildfire] upload failed: ${uploadResult.getMsg()}`);
            return { ok: false, error: new Error(`Upload failed: ${uploadResult.getMsg()}`) };
          }
          
          remoteUrl = uploadResult.getResult();
          console.log(`[wildfire] file uploaded success, remoteUrl=${remoteUrl}`);
        }

        // Detect media type from file extension
        const ext = fileName.toLowerCase();
        console.log(`[wildfire] detecting media type for extension: ${ext}`);
        let payload: any;

        if (ext.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
          console.log(`[wildfire] sending as image`);
          const imageContent = new ImageMessageContent(null, remoteUrl, null);
          payload = imageContent.encode();
        } else if (ext.match(/\.(mp4|mov|avi|mkv|webm)$/)) {
          console.log(`[wildfire] sending as video`);
          const videoContent = new VideoMessageContent(null, remoteUrl, null, 0);
          payload = videoContent.encode();
        } else {
          console.log(`[wildfire] sending as file`);
          const fileContent = new FileMessageContent(null, remoteUrl, fileName, fileSize);
          payload = fileContent.encode();
        }

        if (extra) {
          payload.extra = typeof extra === "string" ? extra : JSON.stringify(extra);
        }

        console.log(`[wildfire] sending message...`);
        const result = await client.sendMessage(conversation, payload);
        console.log(`[wildfire] sendMessage result: success=${result.isSuccess()}, msg=${result.getMsg?.()}`);

        if (!result.isSuccess()) {
          return { ok: false, error: new Error(result.getMsg()) };
        }

        console.log(`[wildfire] sendMedia completed successfully`);
        return { ok: true, provider: "wildfire" };
      } catch (e: any) {
        console.error(`[wildfire] sendMedia error: ${e.message}`, e);
        return { ok: false, error: new Error(e.message) };
      }
    },
  },
};

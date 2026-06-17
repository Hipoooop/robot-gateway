/**
 * Build inbound context with extra field support via buildChannelInboundEventContext.
 * Falls back to manual ctxPayload if the framework function is unavailable.
 */

export async function buildInboundContext(
  api: any,
  params: {
    bodyText: string;
    isGroup: boolean;
    sender: string;
    conv: { type: number; target: string };
    sessionKey: string;
    accountId: string;
    chatType: string;
    conversationLabel: string;
    fromLabel: string;
    senderId: string;
    timestamp: number;
    tenantId: string;
    tenantName: string | null;
    senderUserInfo: any;
    extra: Record<string, unknown> | null;
    config: any;
    route: { agentId: string; sessionKey: string } | null;
    transcript?: string;
    mediaUrl?: string;
  },
): Promise<Record<string, any>> {
  const p = params;

  // Try framework context builder — extra gets spread to MsgContext top-level
  try {
    // Dynamic import — bypasses TS module resolution for external plugins
    const { buildChannelInboundEventContext } =
      await Function('return import("openclaw/plugin-sdk")')() as any;
    return buildChannelInboundEventContext({
      channel: "wildfire",
      accountId: p.accountId,
      provider: "wildfire",
      surface: "wildfire",
      timestamp: p.timestamp,
      from: p.isGroup
        ? `wildfire:${p.tenantId}:group:${p.conv.target}`
        : `wildfire:${p.tenantId}:user:${p.sender}`,
      sender: {
        id: `${p.tenantId}:${p.senderId}`,
        label: p.fromLabel,
      },
      conversation: {
        id: `${p.tenantId}:${p.conv.target}`,
        label: p.conversationLabel,
        type: p.chatType as any,
      },
      route: {
        agentId: p.route?.agentId ?? "main",
        sessionKey: p.sessionKey,
      },
      reply: {
        to: p.isGroup
          ? `wildfire:${p.tenantId}:group:${p.conv.target}`
          : `wildfire:${p.tenantId}:user:${p.sender}`,
        originatingTo: `wildfire:user:${p.sender}`,
      },
      message: {
        body: p.bodyText,
        rawBody: p.bodyText,
      },
      extra: {
        tenantId: p.tenantId,
        tenantName: p.tenantName ?? undefined,
        robotId: p.config.robotId,
        userId: p.senderUserInfo?.userId ?? p.sender,
        displayName: p.senderUserInfo?.displayName,
        mobile: p.senderUserInfo?.mobile,
        isGroup: p.isGroup,
        conversationId: p.conv.target,
        payloadExtra: p.extra,
        senderUserInfo: p.senderUserInfo,
        transcript: p.transcript ?? undefined,
        mediaUrl: p.mediaUrl ?? undefined,
      },
    }) as Record<string, any>;
  } catch {
    api.logger?.warn?.("[wildfire] buildChannelInboundEventContext unavailable, using fallback");
  }

  // Fallback: manual ctxPayload
  const ctx: Record<string, any> = {
    Body: p.bodyText,
    RawBody: p.bodyText,
    From: p.isGroup
      ? `wildfire:group:${p.conv.target}`
      : `wildfire:user:${p.sender}`,
    To: p.isGroup
      ? `wildfire:group:${p.conv.target}`
      : `wildfire:user:${p.sender}`,
    SessionKey: p.sessionKey,
    AccountId: p.accountId,
    ChatType: p.chatType,
    ConversationLabel: p.conversationLabel,
    SenderName: p.fromLabel,
    SenderId: p.senderId,
    Provider: "wildfire",
    Surface: "wildfire",
    MessageSid: `wildfire-${Date.now()}`,
    Timestamp: p.timestamp,
    OriginatingChannel: "wildfire",
    OriginatingTo: `wildfire:user:${p.sender}`,
    RobotId: p.config.robotId,
    TenantId: p.tenantId,
    TenantName: p.tenantName ?? undefined,
    CommandAuthorized: true,
  };
  if (p.transcript) ctx.Transcript = p.transcript;
  return ctx;
}

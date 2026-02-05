import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { setFeishuRuntime } from "./runtime.js";

const contactGet = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    contact: { user: { get: (...args: any[]) => contactGet(...args) } },
  })),
}));

const getMessageFeishu = vi.fn();
vi.mock("./send.js", () => ({
  getMessageFeishu: (...args: any[]) => getMessageFeishu(...args),
  sendMessageFeishu: vi.fn(),
}));

const downloadMessageResourceFeishu = vi.fn();
vi.mock("./media.js", () => ({
  downloadImageFeishu: vi.fn(),
  downloadMessageResourceFeishu: (...args: any[]) => downloadMessageResourceFeishu(...args),
}));

const createFeishuReplyDispatcher = vi.fn();
vi.mock("./reply-dispatcher.js", () => ({
  createFeishuReplyDispatcher: (...args: any[]) => createFeishuReplyDispatcher(...args),
}));

vi.mock("openclaw/plugin-sdk", () => ({
  buildPendingHistoryContextFromMap: vi.fn(({ currentMessage }: any) => `history:${currentMessage}`),
  recordPendingHistoryEntryIfEnabled: vi.fn(),
  clearHistoryEntriesIfEnabled: vi.fn(),
  DEFAULT_GROUP_HISTORY_LIMIT: 20,
}));

import { parseFeishuMessageEvent, handleFeishuMessage } from "./bot.js";
import {
  buildPendingHistoryContextFromMap,
  recordPendingHistoryEntryIfEnabled,
  clearHistoryEntriesIfEnabled,
} from "openclaw/plugin-sdk";

function buildEvent(params: {
  chatType: "p2p" | "group";
  messageType?: string;
  mentions?: any[];
  content?: string;
  parentId?: string;
}) {
  return {
    sender: {
      sender_id: {
        open_id: "ou_sender",
      },
    },
    message: {
      message_id: "msg_1",
      chat_id: params.chatType === "group" ? "oc_group" : "oc_dm",
      chat_type: params.chatType,
      message_type: params.messageType ?? "text",
      content: params.content ?? JSON.stringify({ text: "hello" }),
      mentions: params.mentions ?? [],
      parent_id: params.parentId,
    },
  };
}

describe("feishu bot", () => {
  beforeEach(() => {
    contactGet.mockReset();
    getMessageFeishu.mockReset();
    downloadMessageResourceFeishu.mockReset();
    createFeishuReplyDispatcher.mockReset();

    const dispatchReplyFromConfig = vi.fn().mockResolvedValue({ queuedFinal: true, counts: { final: 1 } });
    setFeishuRuntime({
      channel: {
        routing: {
          resolveAgentRoute: () => ({ agentId: "agent", sessionKey: "sess", accountId: "acc" }),
        },
        commands: {
          shouldComputeCommandAuthorized: () => false,
          resolveCommandAuthorizedFromAuthorizers: () => false,
        },
        pairing: {
          readAllowFromStore: async () => [],
          upsertPairingRequest: async () => ({ code: "0000", created: false }),
          buildPairingReply: () => "pairing",
        },
        reply: {
          resolveEnvelopeFormatOptions: () => ({
            format: "plain",
          }),
          formatAgentEnvelope: ({ body }: any) => body,
          finalizeInboundContext: (ctx: any) => ctx,
          dispatchReplyFromConfig,
        },
        media: {
          saveMediaBuffer: async (_buffer: Buffer, _contentType: string) => ({
            path: "/tmp/file",
            contentType: "image/png",
          }),
        },
      },
      media: {
        detectMime: async () => "image/png",
      },
      system: {
        enqueueSystemEvent: vi.fn(),
      },
    } as any);

    createFeishuReplyDispatcher.mockReturnValue({
      dispatcher: {},
      replyOptions: {},
      markDispatchIdle: vi.fn(),
    });
  });

  it("parses message event and mention forwarding", () => {
    const event = buildEvent({
      chatType: "group",
      mentions: [
        { key: "@_bot", id: { open_id: "ou_bot" }, name: "Bot" },
        { key: "@_user", id: { open_id: "ou_target" }, name: "Alice" },
      ],
      content: JSON.stringify({ text: "hi @_user" }),
    });

    const ctx = parseFeishuMessageEvent(event as any, "ou_bot");
    expect(ctx.mentionTargets).toEqual([
      { openId: "ou_target", name: "Alice", key: "@_user" },
    ]);
    expect(ctx.mentionMessageBody).toBe("hi");
  });

  it("skips DM when allowlist rejects sender", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", dmPolicy: "allowlist", allowFrom: ["ou_allowed"] } },
    } as ClawdbotConfig;

    const event = buildEvent({ chatType: "p2p" });

    await handleFeishuMessage({ cfg, event: event as any, runtime: { log: vi.fn(), error: vi.fn() } as any });

    const core = (await import("./runtime.js")).getFeishuRuntime();
    expect(core.channel.reply.dispatchReplyFromConfig).not.toHaveBeenCalled();
  });

  it("skips group when group allowlist rejects chat", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", groupPolicy: "allowlist", groupAllowFrom: ["oc_allowed"] } },
    } as ClawdbotConfig;

    const event = buildEvent({ chatType: "group" });

    await handleFeishuMessage({ cfg, event: event as any, runtime: { log: vi.fn(), error: vi.fn() } as any });

    const core = (await import("./runtime.js")).getFeishuRuntime();
    expect(core.channel.reply.dispatchReplyFromConfig).not.toHaveBeenCalled();
  });

  it("records history when mention required but missing", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", groupPolicy: "open", requireMention: true } },
    } as ClawdbotConfig;

    const event = buildEvent({ chatType: "group" });
    const histories = new Map();

    await handleFeishuMessage({
      cfg,
      event: event as any,
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatHistories: histories,
    });

    expect(recordPendingHistoryEntryIfEnabled).toHaveBeenCalled();
    expect(buildPendingHistoryContextFromMap).not.toHaveBeenCalled();
  });

  it("dispatches permission error notice and main message", async () => {
    contactGet.mockRejectedValue({
      response: {
        data: {
          code: 99991672,
          msg: "permission denied https://open.feishu.cn/app/abc",
        },
      },
    });

    downloadMessageResourceFeishu.mockResolvedValue({ buffer: Buffer.from("img"), contentType: "image/png" });
    getMessageFeishu.mockResolvedValue({ content: "quoted" });

    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", groupPolicy: "open", requireMention: false } },
    } as ClawdbotConfig;

    const event = buildEvent({
      chatType: "group",
      messageType: "post",
      content: JSON.stringify({
        title: "Title",
        content: [[{ tag: "img", image_key: "img_key" }]],
      }),
      parentId: "parent",
      mentions: [{ key: "@_bot", id: { open_id: "ou_bot" }, name: "Bot" }],
    });

    const histories = new Map();

    await handleFeishuMessage({
      cfg,
      event: event as any,
      botOpenId: "ou_bot",
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatHistories: histories,
    });

    const core = (await import("./runtime.js")).getFeishuRuntime();
    expect(core.channel.reply.dispatchReplyFromConfig).toHaveBeenCalledTimes(2);
    expect(clearHistoryEntriesIfEnabled).toHaveBeenCalled();
  });

  it("adds feishu metadata to the inbound body", async () => {
    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", dmPolicy: "open", allowFrom: ["*"] } },
    } as ClawdbotConfig;

    const event = buildEvent({
      chatType: "p2p",
      mentions: [{ key: "@_user", id: { open_id: "ou_target" }, name: "Alice" }],
      content: JSON.stringify({ text: "紧急上会 @_user" }),
    });

    await handleFeishuMessage({
      cfg,
      event: event as any,
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      botOpenId: "ou_bot",
    });

    const core = (await import("./runtime.js")).getFeishuRuntime();
    const call = (core.channel.reply.dispatchReplyFromConfig as any).mock.calls[0][0];
    const body: string = call.ctx.Body;
    expect(body).toContain("[[feishu_meta");
    expect(body).toContain("\"message_id\":\"msg_1\"");
    expect(body).toContain("\"sender_open_id\":\"ou_sender\"");
    expect(body).toContain("\"open_id\":\"ou_target\"");
  });
});

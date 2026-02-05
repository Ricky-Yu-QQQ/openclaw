import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { setFeishuRuntime } from "./runtime.js";

vi.mock("openclaw/plugin-sdk", () => ({
  createReplyPrefixContext: () => ({
    responsePrefix: "",
    responsePrefixContextProvider: () => "",
    onModelSelected: vi.fn(),
  }),
  createTypingCallbacks: () => ({
    onReplyStart: vi.fn(),
    onIdle: vi.fn(),
  }),
  logTypingFailure: vi.fn(),
}));

const sendMessageFeishu = vi.fn();
const sendMarkdownCardFeishu = vi.fn();

vi.mock("./send.js", () => ({
  sendMessageFeishu: (...args: any[]) => sendMessageFeishu(...args),
  sendMarkdownCardFeishu: (...args: any[]) => sendMarkdownCardFeishu(...args),
}));

vi.mock("./typing.js", () => ({
  addTypingIndicator: vi.fn().mockResolvedValue({ messageId: "m1", reactionId: "r1" }),
  removeTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));

import { createFeishuReplyDispatcher } from "./reply-dispatcher.js";

const baseCfg: ClawdbotConfig = {
  channels: { feishu: { appId: "app", appSecret: "secret" } },
} as ClawdbotConfig;

describe("feishu reply dispatcher", () => {
  beforeEach(() => {
    sendMessageFeishu.mockReset();
    sendMarkdownCardFeishu.mockReset();

    setFeishuRuntime({
      channel: {
        text: {
          resolveTextChunkLimit: () => 5,
          resolveChunkMode: () => "length",
          resolveMarkdownTableMode: () => "native",
          convertMarkdownTables: (text: string) => `converted:${text}`,
          chunkTextWithMode: (text: string) => [text.slice(0, 3), text.slice(3)],
        },
        reply: {
          createReplyDispatcherWithTyping: ({ deliver }: any) => ({
            dispatcher: { deliver },
            replyOptions: { onModelSelected: vi.fn() },
            markDispatchIdle: vi.fn(),
          }),
          resolveHumanDelayConfig: () => ({ enabled: false }),
        },
      },
    } as any);
  });

  it("uses card mode automatically for code blocks", async () => {
    const { dispatcher } = createFeishuReplyDispatcher({
      cfg: baseCfg,
      agentId: "agent",
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatId: "oc_1",
      replyToMessageId: "msg_1",
    });

    await dispatcher.deliver({ text: "```code```" } as any);
    expect(sendMarkdownCardFeishu).toHaveBeenCalled();
    expect(sendMessageFeishu).not.toHaveBeenCalled();
  });

  it("sends raw text when renderMode is raw", async () => {
    const cfg = {
      channels: { feishu: { renderMode: "raw", appId: "app", appSecret: "secret" } },
    } as ClawdbotConfig;

    const { dispatcher } = createFeishuReplyDispatcher({
      cfg,
      agentId: "agent",
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatId: "oc_1",
      replyToMessageId: "msg_1",
      mentionTargets: [{ openId: "ou_1", name: "Alice", key: "@_alice" }],
    });

    await dispatcher.deliver({ text: "hello" } as any);
    expect(sendMessageFeishu).toHaveBeenCalledTimes(2);
    expect(sendMessageFeishu.mock.calls[0][0].mentions).toEqual([
      { openId: "ou_1", name: "Alice", key: "@_alice" },
    ]);
    expect(sendMessageFeishu.mock.calls[1][0].mentions).toBeUndefined();
  });

  it("forces card mode when renderMode is card", async () => {
    const cfg = {
      channels: { feishu: { renderMode: "card", appId: "app", appSecret: "secret" } },
    } as ClawdbotConfig;

    const { dispatcher } = createFeishuReplyDispatcher({
      cfg,
      agentId: "agent",
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatId: "oc_1",
    });

    await dispatcher.deliver({ text: "plain" } as any);
    expect(sendMarkdownCardFeishu).toHaveBeenCalled();
  });

  it("skips empty text payloads", async () => {
    const { dispatcher } = createFeishuReplyDispatcher({
      cfg: baseCfg,
      agentId: "agent",
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatId: "oc_1",
    });

    await dispatcher.deliver({ text: "   " } as any);
    expect(sendMessageFeishu).not.toHaveBeenCalled();
    expect(sendMarkdownCardFeishu).not.toHaveBeenCalled();
  });

  it("uses card mode for markdown tables", async () => {
    const { dispatcher } = createFeishuReplyDispatcher({
      cfg: baseCfg,
      agentId: "agent",
      runtime: { log: vi.fn(), error: vi.fn() } as any,
      chatId: "oc_1",
    });

    const tableText = `| A | B |\n| - | - |\n| 1 | 2 |`;
    await dispatcher.deliver({ text: tableText } as any);
    expect(sendMarkdownCardFeishu).toHaveBeenCalled();
  });
});

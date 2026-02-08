import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setFeishuRuntime } from "./runtime.js";

const sendMessageFeishu = vi.fn();
const sendMediaFeishu = vi.fn();

vi.mock("./send.js", () => ({
  sendMessageFeishu: (...args: any[]) => sendMessageFeishu(...args),
}));

vi.mock("./media.js", () => ({
  sendMediaFeishu: (...args: any[]) => sendMediaFeishu(...args),
}));

import { feishuOutbound } from "./outbound.js";

const cfg = { channels: { feishu: { appId: "app", appSecret: "secret" } } } as ClawdbotConfig;

describe("feishu outbound", () => {
  beforeEach(() => {
    sendMessageFeishu.mockReset();
    sendMediaFeishu.mockReset();
    setFeishuRuntime({
      channel: {
        text: {
          chunkMarkdownText: (text: string, _limit: number) => [text],
        },
      },
    } as any);
  });

  it("chunks markdown text", () => {
    const chunks = feishuOutbound.chunker("hello", 5);
    expect(chunks).toEqual(["hello"]);
  });

  it("sends text", async () => {
    sendMessageFeishu.mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const res = await feishuOutbound.sendText({ cfg, to: "ou_1", text: "hi" } as any);
    expect(res).toEqual({ channel: "feishu", messageId: "m1", chatId: "c1" });
  });

  it("sends media with fallback", async () => {
    sendMessageFeishu.mockResolvedValue({ messageId: "m1", chatId: "c1" });
    sendMediaFeishu.mockRejectedValue(new Error("fail"));

    const res = await feishuOutbound.sendMedia({
      cfg,
      to: "ou_1",
      text: "hi",
      mediaUrl: "https://x",
    } as any);
    expect(res.channel).toBe("feishu");
    expect(sendMessageFeishu).toHaveBeenCalled();
  });
});

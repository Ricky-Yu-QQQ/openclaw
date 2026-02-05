import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

const reactionCreate = vi.fn();
const reactionDelete = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    im: { messageReaction: { create: (...args: any[]) => reactionCreate(...args), delete: (...args: any[]) => reactionDelete(...args) } },
  })),
}));

import { addTypingIndicator, removeTypingIndicator } from "./typing.js";

describe("feishu typing indicator", () => {
  beforeEach(() => {
    reactionCreate.mockReset();
    reactionDelete.mockReset();
  });

  it("returns null reaction when config missing", async () => {
    const cfg = { channels: {} } as ClawdbotConfig;
    const state = await addTypingIndicator({ cfg, messageId: "msg" });
    expect(state).toEqual({ messageId: "msg", reactionId: null });
  });

  it("adds and removes typing indicator", async () => {
    reactionCreate.mockResolvedValue({ data: { reaction_id: "r1" } });

    const cfg = { channels: { feishu: { appId: "app", appSecret: "secret" } } } as ClawdbotConfig;
    const state = await addTypingIndicator({ cfg, messageId: "msg" });

    expect(state).toEqual({ messageId: "msg", reactionId: "r1" });
    expect(reactionCreate).toHaveBeenCalledWith({
      path: { message_id: "msg" },
      data: { reaction_type: { emoji_type: "Get" } },
    });

    await removeTypingIndicator({ cfg, state });
    expect(reactionDelete).toHaveBeenCalled();
  });

  it("uses configured typing emoji", async () => {
    reactionCreate.mockResolvedValue({ data: { reaction_id: "r1" } });

    const cfg = {
      channels: { feishu: { appId: "app", appSecret: "secret", typingEmoji: "GET" } },
    } as ClawdbotConfig;
    await addTypingIndicator({ cfg, messageId: "msg" });

    expect(reactionCreate).toHaveBeenCalledWith({
      path: { message_id: "msg" },
      data: { reaction_type: { emoji_type: "GET" } },
    });
  });

  it("swallows errors when adding/removing", async () => {
    reactionCreate.mockRejectedValue(new Error("boom"));
    reactionDelete.mockRejectedValue(new Error("boom"));

    const cfg = { channels: { feishu: { appId: "app", appSecret: "secret" } } } as ClawdbotConfig;
    const state = await addTypingIndicator({ cfg, messageId: "msg" });
    expect(state.reactionId).toBeNull();

    await removeTypingIndicator({ cfg, state: { messageId: "msg", reactionId: "r1" } });
  });
});

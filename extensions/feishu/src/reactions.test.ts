import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";

const reactionCreate = vi.fn();
const reactionDelete = vi.fn();
const reactionList = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    im: { messageReaction: { create: (...args: any[]) => reactionCreate(...args), delete: (...args: any[]) => reactionDelete(...args), list: (...args: any[]) => reactionList(...args) } },
  })),
}));

import { addReactionFeishu, listReactionsFeishu, removeReactionFeishu } from "./reactions.js";

const cfg = { channels: { feishu: { appId: "app", appSecret: "secret" } } } as ClawdbotConfig;

describe("feishu reactions", () => {
  beforeEach(() => {
    reactionCreate.mockReset();
    reactionDelete.mockReset();
    reactionList.mockReset();
  });

  it("adds reaction", async () => {
    reactionCreate.mockResolvedValue({ code: 0, data: { reaction_id: "r1" } });
    const res = await addReactionFeishu({ cfg, messageId: "msg", emojiType: "SMILE" });
    expect(res.reactionId).toBe("r1");
  });

  it("removes reaction", async () => {
    reactionDelete.mockResolvedValue({ code: 0 });
    await removeReactionFeishu({ cfg, messageId: "msg", reactionId: "r1" });
    expect(reactionDelete).toHaveBeenCalled();
  });

  it("lists reactions", async () => {
    reactionList.mockResolvedValue({
      code: 0,
      data: {
        items: [
          { reaction_id: "r1", reaction_type: { emoji_type: "SMILE" }, operator_type: "app", operator_id: { open_id: "ou_1" } },
          { reaction_id: "r2", reaction_type: { emoji_type: "HEART" }, operator_type: "user", operator_id: { user_id: "u2" } },
        ],
      },
    });

    const res = await listReactionsFeishu({ cfg, messageId: "msg" });
    expect(res).toEqual([
      { reactionId: "r1", emojiType: "SMILE", operatorType: "app", operatorId: "ou_1" },
      { reactionId: "r2", emojiType: "HEART", operatorType: "user", operatorId: "u2" },
    ]);
  });
});

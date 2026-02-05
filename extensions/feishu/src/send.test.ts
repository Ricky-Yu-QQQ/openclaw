import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { setFeishuRuntime } from "./runtime.js";

const messageGet = vi.fn();
const messageCreate = vi.fn();
const messageReply = vi.fn();
const messageUpdate = vi.fn();
const messagePatch = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    im: {
      message: {
        get: (...args: any[]) => messageGet(...args),
        create: (...args: any[]) => messageCreate(...args),
        reply: (...args: any[]) => messageReply(...args),
        update: (...args: any[]) => messageUpdate(...args),
        patch: (...args: any[]) => messagePatch(...args),
      },
    },
  })),
}));

import {
  buildMarkdownCard,
  editMessageFeishu,
  getMessageFeishu,
  sendCardFeishu,
  sendMarkdownCardFeishu,
  sendMessageFeishu,
  updateCardFeishu,
} from "./send.js";

const cfg: ClawdbotConfig = {
  channels: { feishu: { appId: "app", appSecret: "secret" } },
} as ClawdbotConfig;

describe("feishu send", () => {
  beforeEach(() => {
    messageGet.mockReset();
    messageCreate.mockReset();
    messageReply.mockReset();
    messageUpdate.mockReset();
    messagePatch.mockReset();

    setFeishuRuntime({
      channel: {
        text: {
          resolveMarkdownTableMode: () => "native",
          convertMarkdownTables: (text: string) => `converted:${text}`,
        },
      },
    } as any);
  });

  it("gets message content and parses text", async () => {
    messageGet.mockResolvedValue({
      code: 0,
      data: {
        items: [
          {
            message_id: "msg_1",
            chat_id: "oc_1",
            msg_type: "text",
            body: { content: JSON.stringify({ text: "hi" }) },
            sender: { id: "ou_1", id_type: "open_id" },
            create_time: "123",
          },
        ],
      },
    });

    const info = await getMessageFeishu({ cfg, messageId: "msg_1" });
    expect(info).toEqual({
      messageId: "msg_1",
      chatId: "oc_1",
      senderId: "ou_1",
      senderOpenId: "ou_1",
      content: "hi",
      contentType: "text",
      createTime: 123,
    });
  });

  it("sends text message and reply", async () => {
    messageCreate.mockResolvedValue({ code: 0, data: { message_id: "m1" } });
    messageReply.mockResolvedValue({ code: 0, data: { message_id: "m2" } });

    const res = await sendMessageFeishu({ cfg, to: "ou_1", text: "hello" });
    expect(res).toEqual({ messageId: "m1", chatId: "ou_1" });

    const reply = await sendMessageFeishu({
      cfg,
      to: "ou_1",
      text: "hello",
      replyToMessageId: "root",
    });
    expect(reply).toEqual({ messageId: "m2", chatId: "ou_1" });
  });

  it("sends cards and updates cards", async () => {
    messageCreate.mockResolvedValue({ code: 0, data: { message_id: "card1" } });
    messageReply.mockResolvedValue({ code: 0, data: { message_id: "card2" } });
    messagePatch.mockResolvedValue({ code: 0 });

    const card = buildMarkdownCard("hi");
    const res = await sendCardFeishu({ cfg, to: "ou_1", card });
    expect(res).toEqual({ messageId: "card1", chatId: "ou_1" });

    const reply = await sendCardFeishu({ cfg, to: "ou_1", card, replyToMessageId: "root" });
    expect(reply).toEqual({ messageId: "card2", chatId: "ou_1" });

    await updateCardFeishu({ cfg, messageId: "card1", card: { hello: true } });
  });

  it("sends markdown card with mentions", async () => {
    messageCreate.mockResolvedValue({ code: 0, data: { message_id: "card3" } });

    const res = await sendMarkdownCardFeishu({
      cfg,
      to: "ou_1",
      text: "hi",
      mentions: [{ openId: "ou_2", name: "Bob", key: "@_bob" }],
    });

    expect(res).toEqual({ messageId: "card3", chatId: "ou_1" });
  });

  it("edits a message", async () => {
    messageUpdate.mockResolvedValue({ code: 0 });

    await editMessageFeishu({ cfg, messageId: "m1", text: "**bold**" });
    expect(messageUpdate).toHaveBeenCalled();
  });

  it("throws on invalid target", async () => {
    await expect(sendMessageFeishu({ cfg, to: " ", text: "nope" })).rejects.toThrow(
      "Invalid Feishu target",
    );
  });
});

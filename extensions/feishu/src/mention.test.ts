import { describe, expect, it } from "vitest";
import type { FeishuMessageEvent } from "./bot.js";
import {
  buildMentionedCardContent,
  buildMentionedMessage,
  extractMentionTargets,
  extractMessageBody,
  formatMentionForCard,
  formatMentionForText,
  isMentionForwardRequest,
} from "./mention.js";

function buildEvent(params: {
  chatType: "p2p" | "group";
  mentions?: FeishuMessageEvent["message"]["mentions"];
}): FeishuMessageEvent {
  return {
    sender: {
      sender_id: {
        open_id: "sender_open_id",
      },
    },
    message: {
      message_id: "msg_1",
      chat_id: "chat_1",
      chat_type: params.chatType,
      message_type: "text",
      content: JSON.stringify({ text: "hi" }),
      mentions: params.mentions ?? [],
    },
  };
}

describe("mention helpers", () => {
  it("extracts mention targets and excludes the bot", () => {
    const event = buildEvent({
      chatType: "group",
      mentions: [
        {
          key: "@_bot",
          id: { open_id: "bot_open_id" },
          name: "Bot",
        },
        {
          key: "@_user_1",
          id: { open_id: "user_open_id" },
          name: "Alice",
        },
        {
          key: "@_missing",
          id: {},
          name: "Unknown",
        },
      ],
    });

    expect(extractMentionTargets(event, "bot_open_id")).toEqual([
      { openId: "user_open_id", name: "Alice", key: "@_user_1" },
    ]);
  });

  it("detects mention forward requests for DMs", () => {
    const event = buildEvent({
      chatType: "p2p",
      mentions: [
        {
          key: "@_user",
          id: { open_id: "user_open_id" },
          name: "Alice",
        },
      ],
    });

    expect(isMentionForwardRequest(event, "bot_open_id")).toBe(true);
  });

  it("requires bot + user mentions for groups", () => {
    const withBotAndUser = buildEvent({
      chatType: "group",
      mentions: [
        {
          key: "@_bot",
          id: { open_id: "bot_open_id" },
          name: "Bot",
        },
        {
          key: "@_user",
          id: { open_id: "user_open_id" },
          name: "Alice",
        },
      ],
    });

    const onlyBot = buildEvent({
      chatType: "group",
      mentions: [
        {
          key: "@_bot",
          id: { open_id: "bot_open_id" },
          name: "Bot",
        },
      ],
    });

    const onlyUser = buildEvent({
      chatType: "group",
      mentions: [
        {
          key: "@_user",
          id: { open_id: "user_open_id" },
          name: "Alice",
        },
      ],
    });

    expect(isMentionForwardRequest(withBotAndUser, "bot_open_id")).toBe(true);
    expect(isMentionForwardRequest(onlyBot, "bot_open_id")).toBe(false);
    expect(isMentionForwardRequest(onlyUser, "bot_open_id")).toBe(false);
  });

  it("extracts message body by removing mention placeholders", () => {
    const text = "hello @_user_1  world  @_user_2";
    const body = extractMessageBody(text, ["@_user_1", "@_user_2"]);

    expect(body).toBe("hello world");
  });

  it("formats mention strings and builds message/card content", () => {
    const target = { openId: "user_open_id", name: "Alice", key: "@_user_1" };

    expect(formatMentionForText(target)).toBe('<at user_id="user_open_id">Alice</at>');
    expect(formatMentionForCard(target)).toBe("<at id=user_open_id></at>");

    expect(buildMentionedMessage([target], "hi")).toBe(
      '<at user_id="user_open_id">Alice</at> hi',
    );
    expect(buildMentionedCardContent([target], "hi")).toBe("<at id=user_open_id></at> hi");
    expect(buildMentionedCardContent([], "plain")).toBe("plain");
  });
});

import { describe, expect, it } from "vitest";
import type { ChannelGroupContext } from "openclaw/plugin-sdk";
import type { FeishuConfig, FeishuGroupConfig } from "./types.js";
import {
  isFeishuGroupAllowed,
  resolveFeishuAllowlistMatch,
  resolveFeishuGroupConfig,
  resolveFeishuGroupToolPolicy,
  resolveFeishuReplyPolicy,
} from "./policy.js";

describe("feishu policy helpers", () => {
  it("matches allowlist entries by wildcard, id, or name", () => {
    expect(
      resolveFeishuAllowlistMatch({
        allowFrom: ["*"],
        senderId: "ou_123",
        senderName: "Alice",
      }),
    ).toEqual({ allowed: true, matchKey: "*", matchSource: "wildcard" });

    expect(
      resolveFeishuAllowlistMatch({
        allowFrom: ["ou_123"],
        senderId: "OU_123",
        senderName: "Alice",
      }),
    ).toEqual({ allowed: true, matchKey: "ou_123", matchSource: "id" });

    expect(
      resolveFeishuAllowlistMatch({
        allowFrom: ["alice"],
        senderId: "ou_456",
        senderName: "ALICE",
      }),
    ).toEqual({ allowed: true, matchKey: "alice", matchSource: "name" });

    expect(
      resolveFeishuAllowlistMatch({
        allowFrom: [],
        senderId: "ou_456",
        senderName: "Alice",
      }),
    ).toEqual({ allowed: false });
  });

  it("resolves group configuration case-insensitively", () => {
    const cfg = {
      groups: {
        "Group-1": { requireMention: false },
      },
    } as FeishuConfig;

    expect(resolveFeishuGroupConfig({ cfg, groupId: "group-1" })).toEqual({
      requireMention: false,
    });
  });

  it("returns group tool policy from config", () => {
    const cfg = {
      groups: {
        group_1: { tools: { allow: ["feishu_doc"] } },
      },
    } as FeishuConfig;

    const context = {
      cfg: { channels: { feishu: cfg } },
      groupId: "group_1",
    } as ChannelGroupContext;

    expect(resolveFeishuGroupToolPolicy(context)).toEqual({ allow: ["feishu_doc"] });
  });

  it("evaluates group allowlist policy", () => {
    expect(
      isFeishuGroupAllowed({
        groupPolicy: "disabled",
        allowFrom: ["*"],
        senderId: "ou_1",
      }),
    ).toBe(false);

    expect(
      isFeishuGroupAllowed({
        groupPolicy: "open",
        allowFrom: [],
        senderId: "ou_1",
      }),
    ).toBe(true);

    expect(
      isFeishuGroupAllowed({
        groupPolicy: "allowlist",
        allowFrom: ["ou_1"],
        senderId: "ou_1",
      }),
    ).toBe(true);

    expect(
      isFeishuGroupAllowed({
        groupPolicy: "allowlist",
        allowFrom: ["ou_2"],
        senderId: "ou_1",
      }),
    ).toBe(false);
  });

  it("resolves reply policy for DM and groups", () => {
    expect(
      resolveFeishuReplyPolicy({
        isDirectMessage: true,
        globalConfig: { requireMention: true } as FeishuConfig,
      }),
    ).toEqual({ requireMention: false });

    const groupConfig: FeishuGroupConfig = { requireMention: false };

    expect(
      resolveFeishuReplyPolicy({
        isDirectMessage: false,
        globalConfig: { requireMention: true } as FeishuConfig,
        groupConfig,
      }),
    ).toEqual({ requireMention: false });
  });
});

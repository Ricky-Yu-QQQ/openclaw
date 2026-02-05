import {
  jsonResult,
  readStringParam,
  type ChannelMessageActionAdapter,
  type ChannelMessageActionName,
} from "openclaw/plugin-sdk";
import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import type { FeishuConfig } from "./types.js";
import { addReactionFeishu, listReactionsFeishu, removeReactionFeishu } from "./reactions.js";

const isFeishuConfigured = (cfg: ClawdbotConfig): boolean => {
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  return Boolean(feishuCfg?.appId && feishuCfg?.appSecret);
};

export const feishuMessageActions: ChannelMessageActionAdapter = {
  listActions: ({ cfg }) => {
    if (!isFeishuConfigured(cfg)) {
      return [];
    }
    const actions = new Set<ChannelMessageActionName>(["send", "react", "reactions"]);
    return Array.from(actions);
  },
  supportsAction: ({ action }) => action !== "send",
  handleAction: async ({ action, params, cfg }) => {
    if (action === "send") {
      throw new Error("Send should be handled by outbound, not actions handler.");
    }

    if (action === "react") {
      const messageId = readStringParam(params, "messageId", { required: true });
      const emoji = readStringParam(params, "emoji", { allowEmpty: true });
      const remove = typeof params.remove === "boolean" ? params.remove : false;
      const reactionId = readStringParam(params, "reactionId", { allowEmpty: true });

      if (remove) {
        if (reactionId) {
          await removeReactionFeishu({ cfg, messageId, reactionId });
          return jsonResult({ ok: true, removed: reactionId });
        }
        if (!emoji) {
          throw new Error("emoji or reactionId required to remove reaction.");
        }
        const existing = await listReactionsFeishu({
          cfg,
          messageId,
          emojiType: emoji || undefined,
        });
        const removed: string[] = [];
        for (const reaction of existing) {
          if (reaction.operatorType !== "app") {
            continue;
          }
          if (reaction.emojiType !== emoji) {
            continue;
          }
          await removeReactionFeishu({ cfg, messageId, reactionId: reaction.reactionId });
          removed.push(reaction.reactionId);
        }
        return jsonResult({ ok: true, removed });
      }

      if (!emoji) {
        throw new Error("emoji required to add reaction.");
      }

      const result = await addReactionFeishu({ cfg, messageId, emojiType: emoji });
      return jsonResult({ ok: true, added: emoji, reactionId: result.reactionId });
    }

    if (action === "reactions") {
      const messageId = readStringParam(params, "messageId", { required: true });
      const emoji = readStringParam(params, "emoji", { allowEmpty: true });
      const reactions = await listReactionsFeishu({
        cfg,
        messageId,
        emojiType: emoji || undefined,
      });
      return jsonResult({ ok: true, reactions });
    }

    throw new Error(`Action ${action} is not supported for provider feishu.`);
  },
};

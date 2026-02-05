import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonResult, readStringParam, stringEnum } from "openclaw/plugin-sdk";
import type { FeishuConfig } from "./types.js";
import { createFeishuClient } from "./client.js";
import { resolveToolsConfig } from "./tools-config.js";
import {
  UrgentTypes,
  UserIdTypes,
  ensureUserIds,
  readUserIds,
  resolveUrgentUrl,
  type UrgentType,
  type UserIdType,
} from "./urgent-helpers.js";

const UrgentSchema = Type.Object({
  messageId: Type.String({
    description: "Feishu message ID to mark urgent (use feishu_meta.message_id).",
  }),
  urgentType: stringEnum(UrgentTypes, {
    description: "Urgent delivery method: app, sms, or phone.",
  }),
  userIds: Type.Unsafe<string | string[]>({
    description: "User IDs to receive urgent notification (string or array).",
    type: ["string", "array"],
    items: { type: "string" },
  }),
  userIdType: stringEnum(UserIdTypes, {
    description: "User ID type for userIds (default: open_id).",
    default: "open_id",
  }),
});

export async function sendUrgentFeishu(params: {
  cfg: FeishuConfig;
  messageId: string;
  urgentType: UrgentType;
  userIds: string[];
  userIdType: UserIdType;
}) {
  const client = createFeishuClient(params.cfg);
  const url = resolveUrgentUrl(params.messageId, params.urgentType);
  const response = await (client as any).request({
    method: "PATCH",
    url,
    params: { user_id_type: params.userIdType },
    data: { user_id_list: params.userIds },
  });

  if (response?.code !== 0) {
    throw new Error(`Feishu urgent failed: ${response?.msg || `code ${response?.code}`}`);
  }
  return response?.data;
}

export function registerFeishuUrgentTool(api: OpenClawPluginApi) {
  const feishuCfg = api.config?.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg?.appId || !feishuCfg?.appSecret) {
    api.logger.debug?.("feishu_urgent: Feishu credentials not configured, skipping urgent tool");
    return;
  }

  const toolsCfg = resolveToolsConfig(feishuCfg.tools);
  if (!toolsCfg.urgent) {
    api.logger.debug?.("feishu_urgent: urgent tool disabled in config");
    return;
  }

  api.registerTool({
    name: "feishu_urgent",
    description:
      "Send Feishu message urgent notifications (app, SMS, or phone). Use the message_id from feishu_meta in the inbound message.",
    parameters: UrgentSchema,
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const messageId = readStringParam(params, "messageId", { required: true });
      const urgentType = readStringParam(params, "urgentType", { required: true }) as UrgentType;
      const userIds = ensureUserIds(readUserIds(params));
      const userIdType = (readStringParam(params, "userIdType", {
        allowEmpty: true,
      }) as UserIdType | undefined) ?? "open_id";

      const data = await sendUrgentFeishu({
        cfg: feishuCfg,
        messageId,
        urgentType,
        userIds,
        userIdType,
      });

      return jsonResult({
        ok: true,
        messageId,
        urgentType,
        userIdType,
        userIds,
        data,
      });
    },
  });
}

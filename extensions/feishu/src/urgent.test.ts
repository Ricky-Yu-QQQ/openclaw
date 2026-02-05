import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    request: (...args: any[]) => requestMock(...args),
  })),
}));

import { registerFeishuUrgentTool } from "./urgent.js";

function buildApi(cfg: any) {
  const tools: Record<string, any> = {};
  return {
    config: cfg,
    logger: { debug: vi.fn(), info: vi.fn() },
    registerTool: (tool: any) => {
      tools[tool.name] = tool;
    },
    tools,
  } as any;
}

describe("feishu urgent tool", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("skips registration when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuUrgentTool(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("sends urgent app request", async () => {
    requestMock.mockResolvedValue({ code: 0, data: { success: true } });
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret" } },
    });
    registerFeishuUrgentTool(api);

    const tool = api.tools.feishu_urgent;
    const res = await tool.execute("id", {
      messageId: "msg_1",
      urgentType: "app",
      userIds: ["ou_1", "ou_2"],
    });

    expect(res.details.ok).toBe(true);
    expect(requestMock).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/open-apis/im/v1/messages/msg_1/urgent_app",
      params: { user_id_type: "open_id" },
      data: { user_id_list: ["ou_1", "ou_2"] },
    });
  });

  it("sends urgent sms and phone requests", async () => {
    requestMock.mockResolvedValue({ code: 0, data: { success: true } });
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret" } },
    });
    registerFeishuUrgentTool(api);

    const tool = api.tools.feishu_urgent;
    await tool.execute("id", {
      messageId: "msg_2",
      urgentType: "sms",
      userIds: ["ou_3"],
      userIdType: "user_id",
    });
    expect(requestMock).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/open-apis/im/v1/messages/msg_2/urgent_sms",
      params: { user_id_type: "user_id" },
      data: { user_id_list: ["ou_3"] },
    });

    await tool.execute("id", {
      messageId: "msg_3",
      urgentType: "phone",
      userIds: ["ou_4"],
    });
    expect(requestMock).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/open-apis/im/v1/messages/msg_3/urgent_phone",
      params: { user_id_type: "open_id" },
      data: { user_id_list: ["ou_4"] },
    });
  });

  it("validates inputs", async () => {
    requestMock.mockResolvedValue({ code: 0, data: { success: true } });
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret" } },
    });
    registerFeishuUrgentTool(api);

    const tool = api.tools.feishu_urgent;
    await expect(tool.execute("id", { urgentType: "app", userIds: ["ou_1"] })).rejects.toThrow(
      /messageId required/i,
    );
    await expect(
      tool.execute("id", { messageId: "msg_1", urgentType: "app" }),
    ).rejects.toThrow(/userIds required/i);
    await expect(
      tool.execute("id", {
        messageId: "msg_1",
        urgentType: "app",
        userIds: ["chat:oc_1"],
      }),
    ).rejects.toThrow(/userIds must be user ids/i);
  });

  it("throws on api error", async () => {
    requestMock.mockResolvedValue({ code: 123, msg: "denied" });
    const api = buildApi({
      channels: { feishu: { appId: "app", appSecret: "secret" } },
    });
    registerFeishuUrgentTool(api);

    const tool = api.tools.feishu_urgent;
    await expect(
      tool.execute("id", {
        messageId: "msg_9",
        urgentType: "app",
        userIds: ["ou_1"],
      }),
    ).rejects.toThrow(/denied|123/);
  });
});

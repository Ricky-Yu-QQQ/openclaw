import { beforeEach, describe, expect, it, vi } from "vitest";

const wikiGetNodeImpl = vi.fn();
const appGetImpl = vi.fn();
const appTableListImpl = vi.fn();
const fieldListImpl = vi.fn();
const recordListImpl = vi.fn();
const recordGetImpl = vi.fn();
const recordCreateImpl = vi.fn();
const recordUpdateImpl = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    wiki: { space: { getNode: (...args: any[]) => wikiGetNodeImpl(...args) } },
    bitable: {
      app: { get: (...args: any[]) => appGetImpl(...args) },
      appTable: { list: (...args: any[]) => appTableListImpl(...args) },
      appTableField: { list: (...args: any[]) => fieldListImpl(...args) },
      appTableRecord: {
        list: (...args: any[]) => recordListImpl(...args),
        get: (...args: any[]) => recordGetImpl(...args),
        create: (...args: any[]) => recordCreateImpl(...args),
        update: (...args: any[]) => recordUpdateImpl(...args),
      },
    },
  })),
}));

import { registerFeishuBitableTools } from "./bitable.js";

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

describe("feishu bitable tools", () => {
  beforeEach(() => {
    wikiGetNodeImpl.mockReset();
    appGetImpl.mockReset();
    appTableListImpl.mockReset();
    fieldListImpl.mockReset();
    recordListImpl.mockReset();
    recordGetImpl.mockReset();
    recordCreateImpl.mockReset();
    recordUpdateImpl.mockReset();
  });

  it("skips when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuBitableTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("registers and executes bitable actions", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);

    const getMetaTool = api.tools.feishu_bitable_get_meta;
    const listFieldsTool = api.tools.feishu_bitable_list_fields;
    const listRecordsTool = api.tools.feishu_bitable_list_records;
    const getRecordTool = api.tools.feishu_bitable_get_record;
    const createRecordTool = api.tools.feishu_bitable_create_record;
    const updateRecordTool = api.tools.feishu_bitable_update_record;

    wikiGetNodeImpl.mockResolvedValue({
      code: 0,
      data: { node: { obj_type: "bitable", obj_token: "app_token" } },
    });
    appGetImpl.mockResolvedValue({ code: 0, data: { app: { name: "App" } } });
    appTableListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ table_id: "tbl", name: "T" }] },
    });

    const meta = await getMetaTool.execute("id", {
      url: "https://open.feishu.cn/wiki/abc?table=tbl",
    });
    expect(meta.details.app_token).toBe("app_token");

    fieldListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ field_id: "f1", field_name: "Name", type: 1 }] },
    });
    const fields = await listFieldsTool.execute("id", { app_token: "app_token", table_id: "tbl" });
    expect(fields.details.fields[0].field_id).toBe("f1");

    recordListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ record_id: "r1" }], has_more: false },
    });
    const records = await listRecordsTool.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
    });
    expect(records.details.records[0].record_id).toBe("r1");

    recordGetImpl.mockResolvedValue({ code: 0, data: { record: { record_id: "r1" } } });
    const record = await getRecordTool.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      record_id: "r1",
    });
    expect(record.details.record.record_id).toBe("r1");

    recordCreateImpl.mockResolvedValue({ code: 0, data: { record: { record_id: "r2" } } });
    const created = await createRecordTool.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      fields: { Name: "A" },
    });
    expect(created.details.record.record_id).toBe("r2");

    recordUpdateImpl.mockResolvedValue({ code: 0, data: { record: { record_id: "r2" } } });
    const updated = await updateRecordTool.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      record_id: "r2",
      fields: { Name: "B" },
    });
    expect(updated.details.record.record_id).toBe("r2");
  });

  it("returns error on invalid url", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);
    const res = await api.tools.feishu_bitable_get_meta.execute("id", { url: "not a url" });
    expect(res.details.error).toContain("Invalid URL format");
  });
});

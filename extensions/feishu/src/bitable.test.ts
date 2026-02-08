import { beforeEach, describe, expect, it, vi } from "vitest";

const wikiGetNodeImpl = vi.fn();
const appGetImpl = vi.fn();
const appTableListImpl = vi.fn();
const appTableCreateImpl = vi.fn();
const appTablePatchImpl = vi.fn();
const appTableDeleteImpl = vi.fn();
const fieldListImpl = vi.fn();
const fieldCreateImpl = vi.fn();
const fieldUpdateImpl = vi.fn();
const fieldDeleteImpl = vi.fn();
const recordListImpl = vi.fn();
const recordSearchImpl = vi.fn();
const recordGetImpl = vi.fn();
const recordCreateImpl = vi.fn();
const recordUpdateImpl = vi.fn();
const recordBatchCreateImpl = vi.fn();
const recordBatchUpdateImpl = vi.fn();
const recordBatchDeleteImpl = vi.fn();
const viewListImpl = vi.fn();
const viewGetImpl = vi.fn();
const viewCreateImpl = vi.fn();
const viewPatchImpl = vi.fn();
const viewDeleteImpl = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: vi.fn(() => ({
    wiki: { space: { getNode: (...args: any[]) => wikiGetNodeImpl(...args) } },
    bitable: {
      app: { get: (...args: any[]) => appGetImpl(...args) },
      appTable: {
        list: (...args: any[]) => appTableListImpl(...args),
        create: (...args: any[]) => appTableCreateImpl(...args),
        patch: (...args: any[]) => appTablePatchImpl(...args),
        delete: (...args: any[]) => appTableDeleteImpl(...args),
      },
      appTableField: {
        list: (...args: any[]) => fieldListImpl(...args),
        create: (...args: any[]) => fieldCreateImpl(...args),
        update: (...args: any[]) => fieldUpdateImpl(...args),
        delete: (...args: any[]) => fieldDeleteImpl(...args),
      },
      appTableRecord: {
        list: (...args: any[]) => recordListImpl(...args),
        search: (...args: any[]) => recordSearchImpl(...args),
        get: (...args: any[]) => recordGetImpl(...args),
        create: (...args: any[]) => recordCreateImpl(...args),
        update: (...args: any[]) => recordUpdateImpl(...args),
        batchCreate: (...args: any[]) => recordBatchCreateImpl(...args),
        batchUpdate: (...args: any[]) => recordBatchUpdateImpl(...args),
        batchDelete: (...args: any[]) => recordBatchDeleteImpl(...args),
      },
      appTableView: {
        list: (...args: any[]) => viewListImpl(...args),
        get: (...args: any[]) => viewGetImpl(...args),
        create: (...args: any[]) => viewCreateImpl(...args),
        patch: (...args: any[]) => viewPatchImpl(...args),
        delete: (...args: any[]) => viewDeleteImpl(...args),
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
    appTableCreateImpl.mockReset();
    appTablePatchImpl.mockReset();
    appTableDeleteImpl.mockReset();
    fieldListImpl.mockReset();
    fieldCreateImpl.mockReset();
    fieldUpdateImpl.mockReset();
    fieldDeleteImpl.mockReset();
    recordListImpl.mockReset();
    recordSearchImpl.mockReset();
    recordGetImpl.mockReset();
    recordCreateImpl.mockReset();
    recordUpdateImpl.mockReset();
    recordBatchCreateImpl.mockReset();
    recordBatchUpdateImpl.mockReset();
    recordBatchDeleteImpl.mockReset();
    viewListImpl.mockReset();
    viewGetImpl.mockReset();
    viewCreateImpl.mockReset();
    viewPatchImpl.mockReset();
    viewDeleteImpl.mockReset();
  });

  it("skips when credentials missing", () => {
    const api = buildApi({ channels: { feishu: {} } });
    registerFeishuBitableTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("skips when bitable tools are disabled", () => {
    const api = buildApi({
      channels: {
        feishu: {
          appId: "app",
          appSecret: "secret",
          tools: { bitable: false },
        },
      },
    });

    registerFeishuBitableTools(api);
    expect(Object.keys(api.tools)).toHaveLength(0);
  });

  it("registers and executes legacy + structured bitable tools", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);

    const expectedToolNames = [
      "feishu_bitable_get_meta",
      "feishu_bitable_list_tables",
      "feishu_bitable_create_table",
      "feishu_bitable_update_table",
      "feishu_bitable_delete_table",
      "feishu_bitable_list_fields",
      "feishu_bitable_create_field",
      "feishu_bitable_update_field",
      "feishu_bitable_delete_field",
      "feishu_bitable_list_views",
      "feishu_bitable_get_view",
      "feishu_bitable_create_view",
      "feishu_bitable_update_view",
      "feishu_bitable_delete_view",
      "feishu_bitable_list_records",
      "feishu_bitable_search_records",
      "feishu_bitable_get_record",
      "feishu_bitable_create_record",
      "feishu_bitable_update_record",
      "feishu_bitable_batch_create_records",
      "feishu_bitable_batch_update_records",
      "feishu_bitable_batch_delete_records",
    ];

    expect(Object.keys(api.tools).toSorted()).toEqual(expectedToolNames.toSorted());

    wikiGetNodeImpl.mockResolvedValue({
      code: 0,
      data: { node: { obj_type: "bitable", obj_token: "app_token" } },
    });
    appGetImpl.mockResolvedValue({ code: 0, data: { app: { name: "App" } } });
    appTableListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ table_id: "tbl", name: "Table" }], total: 1, has_more: false },
    });
    appTableCreateImpl.mockResolvedValue({
      code: 0,
      data: { table_id: "tbl_new", default_view_id: "vew_new", field_id_list: ["fld_1"] },
    });
    appTablePatchImpl.mockResolvedValue({ code: 0, data: { name: "Renamed" } });
    appTableDeleteImpl.mockResolvedValue({ code: 0, data: {} });

    fieldListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ field_id: "fld_1", field_name: "Name", type: 1 }], total: 1 },
    });
    fieldCreateImpl.mockResolvedValue({
      code: 0,
      data: { field: { field_id: "fld_2", field_name: "Age", type: 2 } },
    });
    fieldUpdateImpl.mockResolvedValue({
      code: 0,
      data: { field: { field_id: "fld_2", field_name: "Age2", type: 2 } },
    });
    fieldDeleteImpl.mockResolvedValue({ code: 0, data: { field_id: "fld_2", deleted: true } });

    viewListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ view_id: "vew_1", view_name: "Grid" }], total: 1 },
    });
    viewGetImpl.mockResolvedValue({
      code: 0,
      data: { view: { view_id: "vew_1", view_name: "Grid" } },
    });
    viewCreateImpl.mockResolvedValue({
      code: 0,
      data: { view: { view_id: "vew_2", view_name: "Kanban" } },
    });
    viewPatchImpl.mockResolvedValue({
      code: 0,
      data: { view: { view_id: "vew_2", view_name: "Kanban2" } },
    });
    viewDeleteImpl.mockResolvedValue({ code: 0, data: {} });

    recordListImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ record_id: "rec_1", fields: {} }], total: 1, has_more: false },
    });
    recordSearchImpl.mockResolvedValue({
      code: 0,
      data: { items: [{ record_id: "rec_1", fields: {} }], total: 1, has_more: false },
    });
    recordGetImpl.mockResolvedValue({
      code: 0,
      data: { record: { record_id: "rec_1", fields: {} } },
    });
    recordCreateImpl.mockResolvedValue({
      code: 0,
      data: { record: { record_id: "rec_2", fields: {} } },
    });
    recordUpdateImpl.mockResolvedValue({
      code: 0,
      data: { record: { record_id: "rec_2", fields: {} } },
    });
    recordBatchCreateImpl.mockResolvedValue({
      code: 0,
      data: { records: [{ record_id: "rec_3", fields: {} }] },
    });
    recordBatchUpdateImpl.mockResolvedValue({
      code: 0,
      data: { records: [{ record_id: "rec_3", fields: {} }] },
    });
    recordBatchDeleteImpl.mockResolvedValue({
      code: 0,
      data: { records: [{ record_id: "rec_3", deleted: true }] },
    });

    const meta = await api.tools.feishu_bitable_get_meta.execute("id", {
      url: "https://open.feishu.cn/wiki/abc?table=tbl",
    });
    expect(meta.details.app_token).toBe("app_token");

    const tables = await api.tools.feishu_bitable_list_tables.execute("id", {
      app_token: "app_token",
    });
    expect(tables.details.tables).toHaveLength(1);

    const tableCreated = await api.tools.feishu_bitable_create_table.execute("id", {
      app_token: "app_token",
      table: { name: "New table" },
    });
    expect(tableCreated.details.table_id).toBe("tbl_new");

    const tableUpdated = await api.tools.feishu_bitable_update_table.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      name: "Renamed",
    });
    expect(tableUpdated.details.name).toBe("Renamed");

    const tableDeleted = await api.tools.feishu_bitable_delete_table.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      confirm: "DELETE",
    });
    expect(tableDeleted.details.success).toBe(true);

    const fields = await api.tools.feishu_bitable_list_fields.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
    });
    expect(fields.details.fields[0].field_id).toBe("fld_1");

    const fieldCreated = await api.tools.feishu_bitable_create_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field: { field_name: "Age", type: 2 },
    });
    expect(fieldCreated.details.field.field_id).toBe("fld_2");

    const fieldUpdated = await api.tools.feishu_bitable_update_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field_id: "fld_2",
      field: { field_name: "Age2", type: 2 },
    });
    expect(fieldUpdated.details.field.field_name).toBe("Age2");

    const fieldDeleted = await api.tools.feishu_bitable_delete_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field_id: "fld_2",
      confirm: "DELETE",
    });
    expect(fieldDeleted.details.deleted).toBe(true);

    const views = await api.tools.feishu_bitable_list_views.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
    });
    expect(views.details.views[0].view_id).toBe("vew_1");

    const view = await api.tools.feishu_bitable_get_view.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      view_id: "vew_1",
    });
    expect(view.details.view.view_id).toBe("vew_1");

    const viewCreated = await api.tools.feishu_bitable_create_view.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      view_name: "Kanban",
      view_type: "kanban",
    });
    expect(viewCreated.details.view.view_id).toBe("vew_2");

    const viewUpdated = await api.tools.feishu_bitable_update_view.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      view_id: "vew_2",
      view_name: "Kanban2",
    });
    expect(viewUpdated.details.view.view_name).toBe("Kanban2");

    const viewDeleted = await api.tools.feishu_bitable_delete_view.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      view_id: "vew_2",
      confirm: "DELETE",
    });
    expect(viewDeleted.details.success).toBe(true);

    const records = await api.tools.feishu_bitable_list_records.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
    });
    expect(records.details.records[0].record_id).toBe("rec_1");

    const searched = await api.tools.feishu_bitable_search_records.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field_names: ["Name"],
    });
    expect(searched.details.records[0].record_id).toBe("rec_1");

    const record = await api.tools.feishu_bitable_get_record.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      record_id: "rec_1",
    });
    expect(record.details.record.record_id).toBe("rec_1");

    const created = await api.tools.feishu_bitable_create_record.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      fields: { Name: "A" },
    });
    expect(created.details.record.record_id).toBe("rec_2");

    const updated = await api.tools.feishu_bitable_update_record.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      record_id: "rec_2",
      fields: { Name: "B" },
    });
    expect(updated.details.record.record_id).toBe("rec_2");

    const batchCreated = await api.tools.feishu_bitable_batch_create_records.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      records: [{ fields: { Name: "A" } }],
    });
    expect(batchCreated.details.records[0].record_id).toBe("rec_3");

    const batchUpdated = await api.tools.feishu_bitable_batch_update_records.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      records: [{ record_id: "rec_3", fields: { Name: "C" } }],
    });
    expect(batchUpdated.details.records[0].record_id).toBe("rec_3");

    const batchDeleted = await api.tools.feishu_bitable_batch_delete_records.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      records: ["rec_3"],
      confirm: "DELETE",
    });
    expect(batchDeleted.details.records[0].record_id).toBe("rec_3");
  });

  it("blocks delete operations when confirmation is missing", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);

    const tableRes = await api.tools.feishu_bitable_delete_table.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
    });
    expect(tableRes.details.error).toContain('confirm="DELETE"');
    expect(appTableDeleteImpl).not.toHaveBeenCalled();

    const fieldRes = await api.tools.feishu_bitable_delete_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field_id: "fld_1",
    });
    expect(fieldRes.details.error).toContain('confirm="DELETE"');
    expect(fieldDeleteImpl).not.toHaveBeenCalled();

    const viewRes = await api.tools.feishu_bitable_delete_view.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      view_id: "vew_1",
    });
    expect(viewRes.details.error).toContain('confirm="DELETE"');
    expect(viewDeleteImpl).not.toHaveBeenCalled();

    const recordRes = await api.tools.feishu_bitable_batch_delete_records.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      records: ["rec_1"],
    });
    expect(recordRes.details.error).toContain('confirm="DELETE"');
    expect(recordBatchDeleteImpl).not.toHaveBeenCalled();
  });

  it("normalizes ui_type aliases for field create and update", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);

    fieldCreateImpl.mockResolvedValue({
      code: 0,
      data: { field: { field_id: "fld_new", field_name: "Title", type: 1 } },
    });
    fieldUpdateImpl.mockResolvedValue({
      code: 0,
      data: { field: { field_id: "fld_new", field_name: "Title", type: 1 } },
    });

    await api.tools.feishu_bitable_create_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field: { field_name: "Title", type: 1, ui_type: "text" },
    });
    expect(fieldCreateImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ui_type: "Text" }),
      }),
    );

    await api.tools.feishu_bitable_update_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field_id: "fld_new",
      field: { field_name: "Title", type: 1, ui_type: "single_select" },
    });
    expect(fieldUpdateImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ui_type: "SingleSelect" }),
      }),
    );
  });

  it("rejects invalid ui_type before calling feishu api", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);

    const res = await api.tools.feishu_bitable_create_field.execute("id", {
      app_token: "app_token",
      table_id: "tbl",
      field: { field_name: "Title", type: 1, ui_type: "text2" },
    });

    expect(res.details.error).toContain("Invalid ui_type");
    expect(fieldCreateImpl).not.toHaveBeenCalled();
  });

  it("returns error on invalid url", async () => {
    const api = buildApi({ channels: { feishu: { appId: "app", appSecret: "secret" } } });
    registerFeishuBitableTools(api);
    const res = await api.tools.feishu_bitable_get_meta.execute("id", { url: "not a url" });
    expect(res.details.error).toContain("Invalid URL format");
  });
});

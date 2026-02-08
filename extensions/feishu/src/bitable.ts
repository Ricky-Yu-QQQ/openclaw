import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { FeishuConfig } from "./types.js";
import { createFeishuClient } from "./client.js";
import { resolveToolsConfig } from "./tools-config.js";

// ============ Helpers ============

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DELETE_CONFIRM_VALUE = "DELETE";

function assertDeleteConfirmed(confirm: string): void {
  if (confirm !== DELETE_CONFIRM_VALUE) {
    throw new Error('Delete operations require confirm="DELETE"');
  }
}

/** Field type ID to human-readable name */
const FIELD_TYPE_NAMES: Record<number, string> = {
  1: "Text",
  2: "Number",
  3: "SingleSelect",
  4: "MultiSelect",
  5: "DateTime",
  7: "Checkbox",
  11: "User",
  13: "Phone",
  15: "URL",
  17: "Attachment",
  18: "SingleLink",
  19: "Lookup",
  20: "Formula",
  21: "DuplexLink",
  22: "Location",
  23: "GroupChat",
  1001: "CreatedTime",
  1002: "ModifiedTime",
  1003: "CreatedUser",
  1004: "ModifiedUser",
  1005: "AutoNumber",
};

const FEISHU_UI_TYPES = [
  "Text",
  "Email",
  "Barcode",
  "Number",
  "Progress",
  "Currency",
  "Rating",
  "SingleSelect",
  "MultiSelect",
  "DateTime",
  "Checkbox",
  "User",
  "GroupChat",
  "Phone",
  "Url",
  "Attachment",
  "SingleLink",
  "Formula",
  "DuplexLink",
  "Location",
  "CreatedTime",
  "ModifiedTime",
  "CreatedUser",
  "ModifiedUser",
  "AutoNumber",
] as const;

type FeishuUiType = (typeof FEISHU_UI_TYPES)[number];

const FEISHU_UI_TYPE_ALIASES: Record<string, FeishuUiType> = {
  text: "Text",
  email: "Email",
  barcode: "Barcode",
  number: "Number",
  progress: "Progress",
  currency: "Currency",
  rating: "Rating",
  singleselect: "SingleSelect",
  multiselect: "MultiSelect",
  datetime: "DateTime",
  checkbox: "Checkbox",
  user: "User",
  groupchat: "GroupChat",
  phone: "Phone",
  url: "Url",
  attachment: "Attachment",
  singlelink: "SingleLink",
  formula: "Formula",
  duplexlink: "DuplexLink",
  location: "Location",
  createdtime: "CreatedTime",
  modifiedtime: "ModifiedTime",
  createduser: "CreatedUser",
  modifieduser: "ModifiedUser",
  autonumber: "AutoNumber",
};

const FEISHU_UI_TYPE_DESCRIPTION = `Allowed values only: ${FEISHU_UI_TYPES.join(", ")}.`;

function normalizeUiType(uiType: string): FeishuUiType | null {
  const key = uiType.replace(/[\s_-]/g, "").toLowerCase();
  return FEISHU_UI_TYPE_ALIASES[key] ?? null;
}

function normalizeFieldUiType<T extends { ui_type?: unknown }>(field: T): T {
  if (field.ui_type === undefined) return field;
  if (typeof field.ui_type !== "string") {
    throw new Error("Invalid ui_type: expected string");
  }

  const normalized = normalizeUiType(field.ui_type);
  if (!normalized) {
    throw new Error(
      `Invalid ui_type "${field.ui_type}". Allowed values: ${FEISHU_UI_TYPES.join(", ")}`,
    );
  }

  return { ...field, ui_type: normalized };
}

type FeishuClient = ReturnType<typeof createFeishuClient>;

type PayloadOf<T> = T extends (payload?: infer P, ...rest: unknown[]) => unknown
  ? NonNullable<P>
  : never;

type TablePayload = NonNullable<
  NonNullable<PayloadOf<FeishuClient["bitable"]["appTable"]["create"]>["data"]>["table"]
>;
type FieldCreatePayload = PayloadOf<FeishuClient["bitable"]["appTableField"]["create"]>["data"];
type FieldUpdatePayload = PayloadOf<FeishuClient["bitable"]["appTableField"]["update"]>["data"];
type ViewType = NonNullable<
  PayloadOf<FeishuClient["bitable"]["appTableView"]["create"]>["data"]
>["view_type"];
type ViewProperty = NonNullable<
  NonNullable<PayloadOf<FeishuClient["bitable"]["appTableView"]["patch"]>["data"]>["property"]
>;
type RecordFields = PayloadOf<
  FeishuClient["bitable"]["appTableRecord"]["create"]
>["data"]["fields"];
type BatchCreateRecords = PayloadOf<
  FeishuClient["bitable"]["appTableRecord"]["batchCreate"]
>["data"]["records"];
type BatchUpdateRecords = PayloadOf<
  FeishuClient["bitable"]["appTableRecord"]["batchUpdate"]
>["data"]["records"];
type SearchSort = NonNullable<
  NonNullable<PayloadOf<FeishuClient["bitable"]["appTableRecord"]["search"]>["data"]>["sort"]
>;
type SearchFilter = NonNullable<
  NonNullable<PayloadOf<FeishuClient["bitable"]["appTableRecord"]["search"]>["data"]>["filter"]
>;

// ============ Core Functions ============

/** Parse bitable URL and extract tokens */
function parseBitableUrl(url: string): { token: string; tableId?: string; isWiki: boolean } | null {
  try {
    const u = new URL(url);
    const tableId = u.searchParams.get("table") ?? undefined;

    // Wiki format: /wiki/XXXXX?table=YYY
    const wikiMatch = u.pathname.match(/\/wiki\/([A-Za-z0-9]+)/);
    if (wikiMatch) {
      return { token: wikiMatch[1], tableId, isWiki: true };
    }

    // Base format: /base/XXXXX?table=YYY
    const baseMatch = u.pathname.match(/\/base\/([A-Za-z0-9]+)/);
    if (baseMatch) {
      return { token: baseMatch[1], tableId, isWiki: false };
    }

    return null;
  } catch {
    return null;
  }
}

/** Get app_token from wiki node_token */
async function getAppTokenFromWiki(client: FeishuClient, nodeToken: string): Promise<string> {
  const res = await client.wiki.space.getNode({
    params: { token: nodeToken },
  });
  if (res.code !== 0) throw new Error(res.msg);

  const node = res.data?.node;
  if (!node) throw new Error("Node not found");
  if (node.obj_type !== "bitable") {
    throw new Error(`Node is not a bitable (type: ${node.obj_type})`);
  }

  return node.obj_token!;
}

/** Get bitable metadata from URL (handles both /base/ and /wiki/ URLs) */
async function getBitableMeta(client: FeishuClient, url: string) {
  const parsed = parseBitableUrl(url);
  if (!parsed) {
    throw new Error("Invalid URL format. Expected /base/XXX or /wiki/XXX URL");
  }

  const appToken = parsed.isWiki ? await getAppTokenFromWiki(client, parsed.token) : parsed.token;

  const res = await client.bitable.app.get({
    path: { app_token: appToken },
  });
  if (res.code !== 0) throw new Error(res.msg);

  let tables: { table_id: string; name: string }[] = [];
  if (!parsed.tableId) {
    const tablesRes = await client.bitable.appTable.list({
      path: { app_token: appToken },
    });
    if (tablesRes.code === 0) {
      tables = (tablesRes.data?.items ?? []).map((t) => ({
        table_id: t.table_id!,
        name: t.name!,
      }));
    }
  }

  return {
    app_token: appToken,
    table_id: parsed.tableId,
    name: res.data?.app?.name,
    url_type: parsed.isWiki ? "wiki" : "base",
    ...(tables.length > 0 && { tables }),
    hint: parsed.tableId
      ? `Use app_token="${appToken}" and table_id="${parsed.tableId}" for other bitable tools`
      : `Use app_token="${appToken}" for other bitable tools. Select a table_id from the tables list.`,
  };
}

async function listTables(
  client: FeishuClient,
  appToken: string,
  pageSize?: number,
  pageToken?: string,
) {
  const res = await client.bitable.appTable.list({
    path: { app_token: appToken },
    params: {
      ...(pageSize !== undefined ? { page_size: pageSize } : {}),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    tables: (res.data?.items ?? []).map((item) => ({
      table_id: item.table_id,
      name: item.name,
      revision: item.revision,
    })),
    has_more: res.data?.has_more ?? false,
    page_token: res.data?.page_token,
    total: res.data?.total,
  };
}

async function createTable(client: FeishuClient, appToken: string, table: TablePayload) {
  const res = await client.bitable.appTable.create({
    path: { app_token: appToken },
    data: { table },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    table_id: res.data?.table_id,
    default_view_id: res.data?.default_view_id,
    field_id_list: res.data?.field_id_list ?? [],
  };
}

async function updateTable(client: FeishuClient, appToken: string, tableId: string, name: string) {
  const res = await client.bitable.appTable.patch({
    path: { app_token: appToken, table_id: tableId },
    data: { name },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    table_id: tableId,
    name: res.data?.name ?? name,
  };
}

async function deleteTable(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  confirm: string,
) {
  assertDeleteConfirmed(confirm);
  const res = await client.bitable.appTable.delete({
    path: { app_token: appToken, table_id: tableId },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return { success: true, table_id: tableId };
}

async function listFields(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  pageSize?: number,
  pageToken?: string,
) {
  const res = await client.bitable.appTableField.list({
    path: { app_token: appToken, table_id: tableId },
    params: {
      ...(pageSize !== undefined ? { page_size: pageSize } : {}),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  const fields = res.data?.items ?? [];
  return {
    fields: fields.map((f) => ({
      field_id: f.field_id,
      field_name: f.field_name,
      type: f.type,
      type_name: FIELD_TYPE_NAMES[f.type ?? 0] || `type_${f.type}`,
      is_primary: f.is_primary,
      is_hidden: f.is_hidden,
      ...(f.property && { property: f.property }),
    })),
    has_more: res.data?.has_more ?? false,
    page_token: res.data?.page_token,
    total: res.data?.total,
  };
}

async function createField(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  field: FieldCreatePayload,
) {
  const normalizedField = normalizeFieldUiType(field);
  const res = await client.bitable.appTableField.create({
    path: { app_token: appToken, table_id: tableId },
    data: normalizedField,
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    field: res.data?.field,
  };
}

async function updateField(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  fieldId: string,
  field: FieldUpdatePayload,
) {
  const normalizedField = normalizeFieldUiType(field);
  const res = await client.bitable.appTableField.update({
    path: { app_token: appToken, table_id: tableId, field_id: fieldId },
    data: normalizedField,
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    field: res.data?.field,
  };
}

async function deleteField(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  fieldId: string,
  confirm: string,
) {
  assertDeleteConfirmed(confirm);
  const res = await client.bitable.appTableField.delete({
    path: { app_token: appToken, table_id: tableId, field_id: fieldId },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    success: true,
    field_id: res.data?.field_id ?? fieldId,
    deleted: res.data?.deleted ?? true,
  };
}

async function listViews(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  pageSize?: number,
  pageToken?: string,
) {
  const res = await client.bitable.appTableView.list({
    path: { app_token: appToken, table_id: tableId },
    params: {
      ...(pageSize !== undefined ? { page_size: pageSize } : {}),
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    views: res.data?.items ?? [],
    has_more: res.data?.has_more ?? false,
    page_token: res.data?.page_token,
    total: res.data?.total,
  };
}

async function getView(client: FeishuClient, appToken: string, tableId: string, viewId: string) {
  const res = await client.bitable.appTableView.get({
    path: { app_token: appToken, table_id: tableId, view_id: viewId },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    view: res.data?.view,
  };
}

async function createView(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  viewName: string,
  viewType?: ViewType,
) {
  const res = await client.bitable.appTableView.create({
    path: { app_token: appToken, table_id: tableId },
    data: {
      view_name: viewName,
      ...(viewType ? { view_type: viewType } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    view: res.data?.view,
  };
}

async function updateView(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  viewId: string,
  viewName?: string,
  property?: ViewProperty,
) {
  if (!viewName && !property) {
    throw new Error("At least one of view_name or property is required");
  }

  const res = await client.bitable.appTableView.patch({
    path: { app_token: appToken, table_id: tableId, view_id: viewId },
    data: {
      ...(viewName ? { view_name: viewName } : {}),
      ...(property ? { property } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    view: res.data?.view,
  };
}

async function deleteView(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  viewId: string,
  confirm: string,
) {
  assertDeleteConfirmed(confirm);
  const res = await client.bitable.appTableView.delete({
    path: { app_token: appToken, table_id: tableId, view_id: viewId },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    success: true,
    view_id: viewId,
  };
}

async function listRecords(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  pageSize?: number,
  pageToken?: string,
) {
  const res = await client.bitable.appTableRecord.list({
    path: { app_token: appToken, table_id: tableId },
    params: {
      page_size: pageSize ?? 100,
      ...(pageToken ? { page_token: pageToken } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    records: res.data?.items ?? [],
    has_more: res.data?.has_more ?? false,
    page_token: res.data?.page_token,
    total: res.data?.total,
  };
}

async function searchRecords(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  options: {
    view_id?: string;
    field_names?: string[];
    sort?: SearchSort;
    filter?: SearchFilter;
    automatic_fields?: boolean;
    user_id_type?: "user_id" | "union_id" | "open_id";
    page_token?: string;
    page_size?: number;
  },
) {
  const res = await client.bitable.appTableRecord.search({
    path: { app_token: appToken, table_id: tableId },
    data: {
      ...(options.view_id ? { view_id: options.view_id } : {}),
      ...(options.field_names ? { field_names: options.field_names } : {}),
      ...(options.sort ? { sort: options.sort } : {}),
      ...(options.filter ? { filter: options.filter } : {}),
      ...(options.automatic_fields !== undefined
        ? { automatic_fields: options.automatic_fields }
        : {}),
    },
    params: {
      ...(options.user_id_type ? { user_id_type: options.user_id_type } : {}),
      ...(options.page_token ? { page_token: options.page_token } : {}),
      ...(options.page_size !== undefined ? { page_size: options.page_size } : {}),
    },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    records: res.data?.items ?? [],
    has_more: res.data?.has_more ?? false,
    page_token: res.data?.page_token,
    total: res.data?.total,
  };
}

async function getRecord(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  recordId: string,
) {
  const res = await client.bitable.appTableRecord.get({
    path: { app_token: appToken, table_id: tableId, record_id: recordId },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    record: res.data?.record,
  };
}

async function createRecord(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  fields: RecordFields,
  clientToken?: string,
  ignoreConsistencyCheck?: boolean,
) {
  const res = await client.bitable.appTableRecord.create({
    path: { app_token: appToken, table_id: tableId },
    params: {
      ...(clientToken ? { client_token: clientToken } : {}),
      ...(ignoreConsistencyCheck !== undefined
        ? { ignore_consistency_check: ignoreConsistencyCheck }
        : {}),
    },
    data: { fields },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    record: res.data?.record,
  };
}

async function updateRecord(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  recordId: string,
  fields: RecordFields,
  ignoreConsistencyCheck?: boolean,
) {
  const res = await client.bitable.appTableRecord.update({
    path: { app_token: appToken, table_id: tableId, record_id: recordId },
    params:
      ignoreConsistencyCheck !== undefined
        ? { ignore_consistency_check: ignoreConsistencyCheck }
        : undefined,
    data: { fields },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    record: res.data?.record,
  };
}

async function batchCreateRecords(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  records: BatchCreateRecords,
  userIdType?: "user_id" | "union_id" | "open_id",
  clientToken?: string,
  ignoreConsistencyCheck?: boolean,
) {
  const res = await client.bitable.appTableRecord.batchCreate({
    path: { app_token: appToken, table_id: tableId },
    params: {
      ...(userIdType ? { user_id_type: userIdType } : {}),
      ...(clientToken ? { client_token: clientToken } : {}),
      ...(ignoreConsistencyCheck !== undefined
        ? { ignore_consistency_check: ignoreConsistencyCheck }
        : {}),
    },
    data: { records },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    records: res.data?.records ?? [],
  };
}

async function batchUpdateRecords(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  records: BatchUpdateRecords,
  userIdType?: "user_id" | "union_id" | "open_id",
  ignoreConsistencyCheck?: boolean,
) {
  const res = await client.bitable.appTableRecord.batchUpdate({
    path: { app_token: appToken, table_id: tableId },
    params: {
      ...(userIdType ? { user_id_type: userIdType } : {}),
      ...(ignoreConsistencyCheck !== undefined
        ? { ignore_consistency_check: ignoreConsistencyCheck }
        : {}),
    },
    data: { records },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    records: res.data?.records ?? [],
  };
}

async function batchDeleteRecords(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  records: string[],
  confirm: string,
) {
  assertDeleteConfirmed(confirm);

  const res = await client.bitable.appTableRecord.batchDelete({
    path: { app_token: appToken, table_id: tableId },
    data: { records },
  });
  if (res.code !== 0) throw new Error(res.msg);

  return {
    records: res.data?.records ?? [],
  };
}

// ============ Schemas ============

const AppTokenSchema = Type.String({
  description: "Bitable app token (use feishu_bitable_get_meta to get from URL)",
});

const TableIdSchema = Type.String({ description: "Table ID (from URL: ?table=YYY)" });

const ConfirmDeleteSchema = Type.Literal(DELETE_CONFIRM_VALUE, {
  description: 'Safety confirmation. Must be exactly "DELETE" for delete operations.',
});

const FieldSchema = Type.Object({
  field_name: Type.String({ description: "Field display name" }),
  type: Type.Number({ description: "Field type ID (e.g. Text=1, Number=2)" }),
  property: Type.Optional(Type.Any({ description: "Field property object (raw Feishu schema)" })),
  description: Type.Optional(Type.Any({ description: "Field description object" })),
  ui_type: Type.Optional(
    Type.String({
      description: `UI type (optional, case-insensitive and normalized before API call). ${FEISHU_UI_TYPE_DESCRIPTION}`,
    }),
  ),
});

const GetMetaSchema = Type.Object({
  url: Type.String({
    description: "Bitable URL. Supports both formats: /base/XXX?table=YYY or /wiki/XXX?table=YYY",
  }),
});

const ListTablesSchema = Type.Object({
  app_token: AppTokenSchema,
  page_size: Type.Optional(
    Type.Number({
      description: "Number of tables per page",
      minimum: 1,
      maximum: 500,
    }),
  ),
  page_token: Type.Optional(
    Type.String({ description: "Pagination token from previous response" }),
  ),
});

const CreateTableSchema = Type.Object({
  app_token: AppTokenSchema,
  table: Type.Object(
    {
      name: Type.String({ description: "Table name" }),
      default_view_name: Type.Optional(Type.String({ description: "Default view name" })),
      fields: Type.Optional(Type.Array(FieldSchema, { description: "Initial field definitions" })),
    },
    { additionalProperties: true },
  ),
});

const UpdateTableSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  name: Type.String({ description: "New table name" }),
});

const DeleteTableSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  confirm: ConfirmDeleteSchema,
});

const ListFieldsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  page_size: Type.Optional(
    Type.Number({
      description: "Number of fields per page",
      minimum: 1,
      maximum: 500,
    }),
  ),
  page_token: Type.Optional(
    Type.String({ description: "Pagination token from previous response" }),
  ),
});

const CreateFieldSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  field: FieldSchema,
});

const UpdateFieldSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  field_id: Type.String({ description: "Field ID to update" }),
  field: FieldSchema,
});

const DeleteFieldSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  field_id: Type.String({ description: "Field ID to delete" }),
  confirm: ConfirmDeleteSchema,
});

const ListViewsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  page_size: Type.Optional(
    Type.Number({
      description: "Number of views per page",
      minimum: 1,
      maximum: 500,
    }),
  ),
  page_token: Type.Optional(
    Type.String({ description: "Pagination token from previous response" }),
  ),
});

const GetViewSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  view_id: Type.String({ description: "View ID" }),
});

const CreateViewSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  view_name: Type.String({ description: "View name" }),
  view_type: Type.Optional(
    Type.String({ description: "View type: grid | kanban | gallery | gantt | form" }),
  ),
});

const UpdateViewSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  view_id: Type.String({ description: "View ID" }),
  view_name: Type.Optional(Type.String({ description: "New view name" })),
  property: Type.Optional(Type.Any({ description: "Raw view property patch object" })),
});

const DeleteViewSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  view_id: Type.String({ description: "View ID" }),
  confirm: ConfirmDeleteSchema,
});

const ListRecordsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  page_size: Type.Optional(
    Type.Number({
      description: "Number of records per page (1-500, default 100)",
      minimum: 1,
      maximum: 500,
    }),
  ),
  page_token: Type.Optional(
    Type.String({ description: "Pagination token from previous response" }),
  ),
});

const SearchRecordsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  view_id: Type.Optional(Type.String({ description: "Filter within a specific view" })),
  field_names: Type.Optional(Type.Array(Type.String(), { description: "Fields to return" })),
  sort: Type.Optional(
    Type.Array(
      Type.Object({
        field_name: Type.Optional(Type.String()),
        desc: Type.Optional(Type.Boolean()),
      }),
      { description: "Sort rules" },
    ),
  ),
  filter: Type.Optional(
    Type.Any({ description: "Filter object (raw Feishu search filter schema)" }),
  ),
  automatic_fields: Type.Optional(Type.Boolean({ description: "Include automatic fields" })),
  user_id_type: Type.Optional(Type.String({ description: "user_id | union_id | open_id" })),
  page_token: Type.Optional(Type.String({ description: "Pagination token" })),
  page_size: Type.Optional(Type.Number({ description: "Page size", minimum: 1, maximum: 500 })),
});

const GetRecordSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  record_id: Type.String({ description: "Record ID to retrieve" }),
});

const CreateRecordSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  fields: Type.Record(Type.String(), Type.Any(), {
    description:
      "Field values keyed by field name. Format by type: Text='string', Number=123, SingleSelect='Option', MultiSelect=['A','B'], DateTime=timestamp_ms, User=[{id:'ou_xxx'}], URL={text:'Display',link:'https://...'}",
  }),
  client_token: Type.Optional(Type.String({ description: "Idempotency token" })),
  ignore_consistency_check: Type.Optional(Type.Boolean({ description: "Skip consistency check" })),
});

const UpdateRecordSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  record_id: Type.String({ description: "Record ID to update" }),
  fields: Type.Record(Type.String(), Type.Any(), {
    description: "Field values to update (same format as create_record)",
  }),
  ignore_consistency_check: Type.Optional(Type.Boolean({ description: "Skip consistency check" })),
});

const BatchCreateRecordsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  records: Type.Array(
    Type.Object(
      {
        fields: Type.Record(Type.String(), Type.Any()),
      },
      { additionalProperties: true },
    ),
    { description: "Records to create", minItems: 1, maxItems: 500 },
  ),
  user_id_type: Type.Optional(Type.String({ description: "user_id | union_id | open_id" })),
  client_token: Type.Optional(Type.String({ description: "Idempotency token" })),
  ignore_consistency_check: Type.Optional(Type.Boolean({ description: "Skip consistency check" })),
});

const BatchUpdateRecordsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  records: Type.Array(
    Type.Object(
      {
        record_id: Type.String(),
        fields: Type.Record(Type.String(), Type.Any()),
      },
      { additionalProperties: true },
    ),
    { description: "Records to update", minItems: 1, maxItems: 500 },
  ),
  user_id_type: Type.Optional(Type.String({ description: "user_id | union_id | open_id" })),
  ignore_consistency_check: Type.Optional(Type.Boolean({ description: "Skip consistency check" })),
});

const BatchDeleteRecordsSchema = Type.Object({
  app_token: AppTokenSchema,
  table_id: TableIdSchema,
  records: Type.Array(Type.String(), {
    description: "Record IDs to delete",
    minItems: 1,
    maxItems: 500,
  }),
  confirm: ConfirmDeleteSchema,
});

// ============ Tool Registration ============

type JsonToolParams = Record<string, unknown>;

function registerJsonTool<TParams extends JsonToolParams>(
  api: OpenClawPluginApi,
  registered: string[],
  options: {
    name: string;
    label: string;
    description: string;
    parameters: object;
    execute: (params: TParams) => Promise<unknown>;
  },
): void {
  api.registerTool(
    {
      name: options.name,
      label: options.label,
      description: options.description,
      parameters: options.parameters,
      async execute(_toolCallId, params) {
        try {
          return json(await options.execute(params as TParams));
        } catch (err) {
          return json({ error: toErrorMessage(err) });
        }
      },
    },
    { name: options.name },
  );
  registered.push(options.name);
}

export function registerFeishuBitableTools(api: OpenClawPluginApi) {
  const feishuCfg = api.config?.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg?.appId || !feishuCfg?.appSecret) {
    api.logger.debug?.("feishu_bitable: Feishu credentials not configured, skipping bitable tools");
    return;
  }

  const toolsCfg = resolveToolsConfig(feishuCfg.tools);
  if (!toolsCfg.bitable) {
    api.logger.info?.("feishu_bitable: Disabled by channels.feishu.tools.bitable=false");
    return;
  }

  const getClient = () => createFeishuClient(feishuCfg);
  const registered: string[] = [];

  registerJsonTool(api, registered, {
    name: "feishu_bitable_get_meta",
    label: "Feishu Bitable Get Meta",
    description:
      "Parse a Bitable URL and get app_token, table_id, and table list. Use this first when given a /wiki/ or /base/ URL.",
    parameters: GetMetaSchema,
    async execute(params) {
      const { url } = params as { url: string };
      return await getBitableMeta(getClient(), url);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_list_tables",
    label: "Feishu Bitable List Tables",
    description: "List tables in a Bitable app",
    parameters: ListTablesSchema,
    async execute(params) {
      const { app_token, page_size, page_token } = params as {
        app_token: string;
        page_size?: number;
        page_token?: string;
      };
      return await listTables(getClient(), app_token, page_size, page_token);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_create_table",
    label: "Feishu Bitable Create Table",
    description: "Create a new table in a Bitable app",
    parameters: CreateTableSchema,
    async execute(params) {
      const { app_token, table } = params as { app_token: string; table: TablePayload };
      return await createTable(getClient(), app_token, table);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_update_table",
    label: "Feishu Bitable Update Table",
    description: "Rename an existing table in a Bitable app",
    parameters: UpdateTableSchema,
    async execute(params) {
      const { app_token, table_id, name } = params as {
        app_token: string;
        table_id: string;
        name: string;
      };
      return await updateTable(getClient(), app_token, table_id, name);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_delete_table",
    label: "Feishu Bitable Delete Table",
    description: 'Delete a table. Requires confirm="DELETE"',
    parameters: DeleteTableSchema,
    async execute(params) {
      const { app_token, table_id, confirm } = params as {
        app_token: string;
        table_id: string;
        confirm: string;
      };
      return await deleteTable(getClient(), app_token, table_id, confirm);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_list_fields",
    label: "Feishu Bitable List Fields",
    description: "List all fields (columns) in a Bitable table with their types and properties",
    parameters: ListFieldsSchema,
    async execute(params) {
      const { app_token, table_id, page_size, page_token } = params as {
        app_token: string;
        table_id: string;
        page_size?: number;
        page_token?: string;
      };
      return await listFields(getClient(), app_token, table_id, page_size, page_token);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_create_field",
    label: "Feishu Bitable Create Field",
    description: "Create a new field (column) in a table",
    parameters: CreateFieldSchema,
    async execute(params) {
      const { app_token, table_id, field } = params as {
        app_token: string;
        table_id: string;
        field: FieldCreatePayload;
      };
      return await createField(getClient(), app_token, table_id, field);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_update_field",
    label: "Feishu Bitable Update Field",
    description: "Update an existing field (column) in a table",
    parameters: UpdateFieldSchema,
    async execute(params) {
      const { app_token, table_id, field_id, field } = params as {
        app_token: string;
        table_id: string;
        field_id: string;
        field: FieldUpdatePayload;
      };
      return await updateField(getClient(), app_token, table_id, field_id, field);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_delete_field",
    label: "Feishu Bitable Delete Field",
    description: 'Delete a field (column). Requires confirm="DELETE"',
    parameters: DeleteFieldSchema,
    async execute(params) {
      const { app_token, table_id, field_id, confirm } = params as {
        app_token: string;
        table_id: string;
        field_id: string;
        confirm: string;
      };
      return await deleteField(getClient(), app_token, table_id, field_id, confirm);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_list_views",
    label: "Feishu Bitable List Views",
    description: "List views in a table",
    parameters: ListViewsSchema,
    async execute(params) {
      const { app_token, table_id, page_size, page_token } = params as {
        app_token: string;
        table_id: string;
        page_size?: number;
        page_token?: string;
      };
      return await listViews(getClient(), app_token, table_id, page_size, page_token);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_get_view",
    label: "Feishu Bitable Get View",
    description: "Get details for a specific view",
    parameters: GetViewSchema,
    async execute(params) {
      const { app_token, table_id, view_id } = params as {
        app_token: string;
        table_id: string;
        view_id: string;
      };
      return await getView(getClient(), app_token, table_id, view_id);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_create_view",
    label: "Feishu Bitable Create View",
    description: "Create a view in a table",
    parameters: CreateViewSchema,
    async execute(params) {
      const { app_token, table_id, view_name, view_type } = params as {
        app_token: string;
        table_id: string;
        view_name: string;
        view_type?: ViewType;
      };
      return await createView(getClient(), app_token, table_id, view_name, view_type);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_update_view",
    label: "Feishu Bitable Update View",
    description: "Update view metadata or properties",
    parameters: UpdateViewSchema,
    async execute(params) {
      const { app_token, table_id, view_id, view_name, property } = params as {
        app_token: string;
        table_id: string;
        view_id: string;
        view_name?: string;
        property?: ViewProperty;
      };
      return await updateView(getClient(), app_token, table_id, view_id, view_name, property);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_delete_view",
    label: "Feishu Bitable Delete View",
    description: 'Delete a view. Requires confirm="DELETE"',
    parameters: DeleteViewSchema,
    async execute(params) {
      const { app_token, table_id, view_id, confirm } = params as {
        app_token: string;
        table_id: string;
        view_id: string;
        confirm: string;
      };
      return await deleteView(getClient(), app_token, table_id, view_id, confirm);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_list_records",
    label: "Feishu Bitable List Records",
    description: "List records (rows) from a Bitable table with pagination support",
    parameters: ListRecordsSchema,
    async execute(params) {
      const { app_token, table_id, page_size, page_token } = params as {
        app_token: string;
        table_id: string;
        page_size?: number;
        page_token?: string;
      };
      return await listRecords(getClient(), app_token, table_id, page_size, page_token);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_search_records",
    label: "Feishu Bitable Search Records",
    description: "Search records in a table with filter and sort",
    parameters: SearchRecordsSchema,
    async execute(params) {
      const {
        app_token,
        table_id,
        view_id,
        field_names,
        sort,
        filter,
        automatic_fields,
        user_id_type,
        page_token,
        page_size,
      } = params as {
        app_token: string;
        table_id: string;
        view_id?: string;
        field_names?: string[];
        sort?: SearchSort;
        filter?: SearchFilter;
        automatic_fields?: boolean;
        user_id_type?: "user_id" | "union_id" | "open_id";
        page_token?: string;
        page_size?: number;
      };

      return await searchRecords(getClient(), app_token, table_id, {
        view_id,
        field_names,
        sort,
        filter,
        automatic_fields,
        user_id_type,
        page_token,
        page_size,
      });
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_get_record",
    label: "Feishu Bitable Get Record",
    description: "Get a single record by ID from a Bitable table",
    parameters: GetRecordSchema,
    async execute(params) {
      const { app_token, table_id, record_id } = params as {
        app_token: string;
        table_id: string;
        record_id: string;
      };
      return await getRecord(getClient(), app_token, table_id, record_id);
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_create_record",
    label: "Feishu Bitable Create Record",
    description: "Create a new record (row) in a Bitable table",
    parameters: CreateRecordSchema,
    async execute(params) {
      const { app_token, table_id, fields, client_token, ignore_consistency_check } = params as {
        app_token: string;
        table_id: string;
        fields: RecordFields;
        client_token?: string;
        ignore_consistency_check?: boolean;
      };
      return await createRecord(
        getClient(),
        app_token,
        table_id,
        fields,
        client_token,
        ignore_consistency_check,
      );
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_update_record",
    label: "Feishu Bitable Update Record",
    description: "Update an existing record (row) in a Bitable table",
    parameters: UpdateRecordSchema,
    async execute(params) {
      const { app_token, table_id, record_id, fields, ignore_consistency_check } = params as {
        app_token: string;
        table_id: string;
        record_id: string;
        fields: RecordFields;
        ignore_consistency_check?: boolean;
      };
      return await updateRecord(
        getClient(),
        app_token,
        table_id,
        record_id,
        fields,
        ignore_consistency_check,
      );
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_batch_create_records",
    label: "Feishu Bitable Batch Create Records",
    description: "Create multiple records in one request (up to 500)",
    parameters: BatchCreateRecordsSchema,
    async execute(params) {
      const { app_token, table_id, records, user_id_type, client_token, ignore_consistency_check } =
        params as {
          app_token: string;
          table_id: string;
          records: BatchCreateRecords;
          user_id_type?: "user_id" | "union_id" | "open_id";
          client_token?: string;
          ignore_consistency_check?: boolean;
        };

      return await batchCreateRecords(
        getClient(),
        app_token,
        table_id,
        records,
        user_id_type,
        client_token,
        ignore_consistency_check,
      );
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_batch_update_records",
    label: "Feishu Bitable Batch Update Records",
    description: "Update multiple records in one request (up to 500)",
    parameters: BatchUpdateRecordsSchema,
    async execute(params) {
      const { app_token, table_id, records, user_id_type, ignore_consistency_check } = params as {
        app_token: string;
        table_id: string;
        records: BatchUpdateRecords;
        user_id_type?: "user_id" | "union_id" | "open_id";
        ignore_consistency_check?: boolean;
      };

      return await batchUpdateRecords(
        getClient(),
        app_token,
        table_id,
        records,
        user_id_type,
        ignore_consistency_check,
      );
    },
  });

  registerJsonTool(api, registered, {
    name: "feishu_bitable_batch_delete_records",
    label: "Feishu Bitable Batch Delete Records",
    description: 'Delete multiple records (up to 500). Requires confirm="DELETE"',
    parameters: BatchDeleteRecordsSchema,
    async execute(params) {
      const { app_token, table_id, records, confirm } = params as {
        app_token: string;
        table_id: string;
        records: string[];
        confirm: string;
      };

      return await batchDeleteRecords(getClient(), app_token, table_id, records, confirm);
    },
  });

  api.logger.info?.(`feishu_bitable: Registered ${registered.length} bitable tools`);
}

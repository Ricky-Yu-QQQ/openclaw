/**
 * 飞书 API 客户端
 */

import * as lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";
import * as path from "path";
import type { ResolvedFeishuAccount, ApiResult } from "./types.js";
import type { RuntimeLogger } from "./compat.js";
import { getFeishuRuntime } from "./runtime.js";

// 客户端缓存
const clientCache = new Map<string, lark.Client>();
const proxiedClientCache = new Map<string, lark.Client>();

const REDACT_KEYS = new Set([
  "appSecret",
  "app_secret",
  "access_token",
  "tenant_access_token",
  "Authorization",
  "authorization",
  "token",
  "password",
  "secret",
]);

const MAX_LOG_STRING = 400;

function sanitizeValue(value: unknown, depth = 2): unknown {
  if (depth <= 0) return "[depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING ? `${value.slice(0, MAX_LOG_STRING)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[function]";
  if (typeof value === "symbol") return value.toString();
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return `[Blob size=${value.size} type=${value.type || "unknown"}]`;
  }
  if (value instanceof Buffer) {
    return `[Buffer length=${value.length}]`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth - 1));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      if (REDACT_KEYS.has(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeValue(entry, depth - 1);
      }
    }
    return out;
  }
  return "[unknown]";
}

function getFeishuLogger(account: ResolvedFeishuAccount): RuntimeLogger {
  try {
    const runtime = getFeishuRuntime();
    return runtime.logging.getChildLogger({
      scope: "feishu",
      accountId: account.accountId,
    });
  } catch {
    return {
      info: (message) => console.info(message),
      warn: (message) => console.warn(message),
      error: (message) => console.error(message),
    };
  }
}

function logApiCall(
  logger: RuntimeLogger,
  path: string,
  args: unknown[],
  result?: unknown,
  error?: unknown
): void {
  const argsPayload = sanitizeValue(args, 2);
  if (error) {
    logger.error(
      `[feishu api] ${path} failed: ${String(error)} | args=${JSON.stringify(argsPayload)}`
    );
    return;
  }
  if (result && typeof result === "object" && "code" in (result as Record<string, unknown>)) {
    const code = (result as Record<string, unknown>).code;
    const msg = (result as Record<string, unknown>).msg;
    logger.info(
      `[feishu api] ${path} -> code=${String(code)}${msg ? ` msg=${String(msg)}` : ""} | args=${JSON.stringify(argsPayload)}`
    );
    return;
  }
  logger.info(`[feishu api] ${path} ok | args=${JSON.stringify(argsPayload)}`);
}

function createLoggingProxy<T extends object>(
  target: T,
  basePath: string,
  logger: RuntimeLogger,
  cache: WeakMap<object, object>
): T {
  if (cache.has(target)) {
    return cache.get(target) as T;
  }
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "symbol") {
        return Reflect.get(obj, prop, receiver);
      }
      const value = Reflect.get(obj, prop, receiver) as unknown;
      const path = basePath ? `${basePath}.${String(prop)}` : String(prop);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          try {
            const result = (value as (...inner: unknown[]) => unknown).apply(obj, args);
            if (result && typeof (result as Promise<unknown>).then === "function") {
              return (result as Promise<unknown>)
                .then((resolved) => {
                  logApiCall(logger, path, args, resolved);
                  return resolved;
                })
                .catch((err) => {
                  logApiCall(logger, path, args, undefined, err);
                  throw err;
                });
            }
            logApiCall(logger, path, args, result);
            return result;
          } catch (err) {
            logApiCall(logger, path, args, undefined, err);
            throw err;
          }
        };
      }
      if (value && typeof value === "object") {
        return createLoggingProxy(value as object, path, logger, cache);
      }
      return value;
    },
  });
  cache.set(target, proxy as object);
  return proxy as T;
}

/**
 * 获取或创建飞书客户端
 */
export function getFeishuClient(account: ResolvedFeishuAccount): lark.Client {
  const cacheKey = account.appId;

  const existingProxy = proxiedClientCache.get(cacheKey);
  if (existingProxy) {
    return existingProxy;
  }

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new lark.Client({
      appId: account.appId,
      appSecret: account.appSecret,
    });
    clientCache.set(cacheKey, client);
  }
  const logger = getFeishuLogger(account);
  const proxyCache = new WeakMap<object, object>();
  const proxied = createLoggingProxy(client as unknown as object, "client", logger, proxyCache);
  proxiedClientCache.set(cacheKey, proxied as lark.Client);
  return proxied as lark.Client;
}

export async function feishuFetch(
  account: ResolvedFeishuAccount,
  url: string,
  options?: RequestInit
): Promise<Response> {
  const logger = getFeishuLogger(account);
  const method = options?.method ?? "GET";
  const headers = options?.headers ? sanitizeValue(options.headers, 2) : undefined;
  logger.info(
    `[feishu api] fetch ${method} ${url}${headers ? ` | headers=${JSON.stringify(headers)}` : ""}`
  );
  try {
    const response = await globalThis.fetch(url, options);
    logger.info(
      `[feishu api] fetch ${method} ${url} -> status=${response.status} ${response.statusText}`
    );
    return response;
  } catch (error) {
    logger.error(`[feishu api] fetch ${method} ${url} failed: ${String(error)}`);
    throw error;
  }
}

// ==================== 消息 API ====================

/**
 * 发送文本消息
 */
export async function sendTextMessage(
  account: ResolvedFeishuAccount,
  chatId: string,
  text: string
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });

    if (result.code === 0) {
      return { ok: true, data: { messageId: result.data?.message_id || "" } };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 发送富文本消息
 */
export async function sendPostMessage(
  account: ResolvedFeishuAccount,
  chatId: string,
  title: string,
  content: any[][]
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "post",
        content: JSON.stringify({ zh_cn: { title, content } }),
      },
    });

    if (result.code === 0) {
      return { ok: true, data: { messageId: result.data?.message_id || "" } };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 发送卡片消息
 */
export async function sendCardMessage(
  account: ResolvedFeishuAccount,
  chatId: string,
  card: Record<string, any>
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
    });

    if (result.code === 0) {
      return { ok: true, data: { messageId: result.data?.message_id || "" } };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 发送图片消息
 */
export async function sendImageMessage(
  account: ResolvedFeishuAccount,
  chatId: string,
  imagePath: string
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    // 上传图片
    const imageBuffer = fs.readFileSync(imagePath);
    const uploadResult = await client.im.v1.image.create({
      data: {
        image_type: "message",
        image: new Blob([imageBuffer]),
      },
    });

    if (uploadResult.code !== 0) {
      return { ok: false, error: uploadResult.msg };
    }

    const imageKey = uploadResult.data?.image_key;
    if (!imageKey) {
      return { ok: false, error: "Failed to get image key" };
    }

    // 发送图片消息
    const result = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "image",
        content: JSON.stringify({ image_key: imageKey }),
      },
    });

    if (result.code === 0) {
      return { ok: true, data: { messageId: result.data?.message_id || "" } };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 发送文件消息
 */
export async function sendFileMessage(
  account: ResolvedFeishuAccount,
  chatId: string,
  filePath: string,
  fileName?: string
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const actualFileName = fileName || path.basename(filePath);

    // 上传文件
    const uploadResult = await client.im.v1.file.create({
      data: {
        file_type: "stream",
        file_name: actualFileName,
        file: new Blob([fileBuffer]),
      },
    });

    if (uploadResult.code !== 0) {
      return { ok: false, error: uploadResult.msg };
    }

    const fileKey = uploadResult.data?.file_key;
    if (!fileKey) {
      return { ok: false, error: "Failed to get file key" };
    }

    // 发送文件消息
    const result = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "file",
        content: JSON.stringify({ file_key: fileKey }),
      },
    });

    if (result.code === 0) {
      return { ok: true, data: { messageId: result.data?.message_id || "" } };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 回复消息
 */
export async function replyMessage(
  account: ResolvedFeishuAccount,
  messageId: string,
  text: string
): Promise<ApiResult> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });

    if (result.code === 0) {
      return { ok: true };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 撤回消息
 */
export async function recallMessage(
  account: ResolvedFeishuAccount,
  messageId: string
): Promise<ApiResult> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.delete({
      path: { message_id: messageId },
    });

    if (result.code === 0) {
      return { ok: true };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 获取单条消息内容
 */
export async function getMessage(
  account: ResolvedFeishuAccount,
  messageId: string
): Promise<ApiResult<{ messageType: string; content: string; text?: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.get({
      path: { message_id: messageId },
    });

    if (result.code === 0 && result.data?.items?.[0]) {
      const msg = result.data.items[0];
      const messageType = msg.msg_type || "";
      const content = msg.body?.content || "";

      // 尝试提取文本内容
      let text: string | undefined;
      try {
        const parsed = JSON.parse(content);
        if (messageType === "text") {
          text = parsed.text;
        } else if (messageType === "post") {
          // 富文本消息，提取纯文本
          const extractText = (node: any): string => {
            if (typeof node === "string") return node;
            if (node.text) return node.text;
            if (Array.isArray(node)) return node.map(extractText).join("");
            if (node.content) return extractText(node.content);
            if (node.zh_cn?.content) return extractText(node.zh_cn.content);
            return "";
          };
          text = extractText(parsed);
        }
      } catch {
        // ignore
      }

      return {
        ok: true,
        data: { messageType, content, text },
      };
    }
    return { ok: false, error: result.msg || "Message not found" };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 转发消息
 */
export async function forwardMessage(
  account: ResolvedFeishuAccount,
  messageId: string,
  targetChatId: string
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.forward({
      path: { message_id: messageId },
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: targetChatId,
      },
    });

    if (result.code === 0) {
      return {
        ok: true,
        data: { messageId: result.data?.message_id || "" },
      };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 合并转发多条消息
 */
export async function mergeForwardMessages(
  account: ResolvedFeishuAccount,
  messageIds: string[],
  targetChatId: string
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.mergeForward({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: targetChatId,
        message_id_list: messageIds,
      },
    });

    if (result.code === 0) {
      return {
        ok: true,
        data: { messageId: result.data?.message_id || "" },
      };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 发送加急消息 (应用内)
 */
export async function sendUrgentMessage(
  account: ResolvedFeishuAccount,
  messageId: string,
  userIds: string[]
): Promise<ApiResult<{ invalidUserIds?: string[] }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.urgentApp({
      path: { message_id: messageId },
      params: { user_id_type: "open_id" },
      data: {
        user_id_list: userIds,
      },
    });

    if (result.code === 0) {
      return {
        ok: true,
        data: { invalidUserIds: result.data?.invalid_user_id_list },
      };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 获取消息已读用户列表
 */
export async function getMessageReadUsers(
  account: ResolvedFeishuAccount,
  messageId: string,
  options?: {
    pageSize?: number;
    pageToken?: string;
  }
): Promise<ApiResult<{ users: Array<{ userId: string; readTime: number }>; pageToken?: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.readUsers({
      path: { message_id: messageId },
      params: {
        user_id_type: "open_id",
        page_size: options?.pageSize || 50,
        page_token: options?.pageToken,
      },
    });

    if (result.code === 0) {
      const users = (result.data?.items || []).map((u: any) => ({
        userId: u.user_id,
        readTime: parseInt(u.timestamp, 10) || 0,
      }));
      return {
        ok: true,
        data: {
          users,
          pageToken: result.data?.page_token,
        },
      };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ==================== 下载 API ====================

/**
 * 将飞书 SDK 返回的响应转换为 Buffer
 */
async function responseToBuffer(response: any): Promise<Buffer | null> {
  // 如果已经是 Buffer
  if (Buffer.isBuffer(response)) {
    return response;
  }

  // 如果是 ArrayBuffer
  if (response instanceof ArrayBuffer) {
    return Buffer.from(response);
  }

  // 飞书 SDK 返回的对象带有 getReadableStream 方法
  if (response && typeof response.getReadableStream === "function") {
    const stream = response.getReadableStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    return Buffer.concat(chunks);
  }

  // 如果是 Node.js Stream
  if (response && typeof response.pipe === "function") {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve());
      response.on("error", reject);
    });
    return Buffer.concat(chunks);
  }

  return null;
}

/**
 * 通过 image_key 下载图片
 */
export async function downloadImageByKey(
  account: ResolvedFeishuAccount,
  imageKey: string
): Promise<ApiResult<{ buffer: Buffer; mimeType: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.image.get({
      path: { image_key: imageKey },
    });

    const buffer = await responseToBuffer(result);
    if (buffer) {
      return {
        ok: true,
        data: {
          buffer,
          mimeType: "image/png",
        },
      };
    }

    return { ok: false, error: "Unexpected response format" };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 下载消息中的图片（通过消息 ID 和 image_key）
 * 注意：用户发送的图片必须通过 messageResource API 下载，不能用 image API
 */
export async function downloadMessageImage(
  account: ResolvedFeishuAccount,
  messageId: string,
  imageKey: string
): Promise<ApiResult<{ buffer: Buffer; mimeType: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.messageResource.get({
      path: {
        message_id: messageId,
        file_key: imageKey,
      },
      params: {
        type: "image",
      },
    });

    const buffer = await responseToBuffer(result);
    if (buffer) {
      return {
        ok: true,
        data: {
          buffer,
          mimeType: "image/png",
        },
      };
    }

    return { ok: false, error: "Unexpected response format" };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 下载文件（通过消息 ID 和 file_key）
 */
export async function downloadMessageFile(
  account: ResolvedFeishuAccount,
  messageId: string,
  fileKey: string
): Promise<ApiResult<{ buffer: Buffer; fileName?: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.messageResource.get({
      path: {
        message_id: messageId,
        file_key: fileKey,
      },
      params: {
        type: "file",
      },
    });

    const buffer = await responseToBuffer(result);
    if (buffer) {
      return {
        ok: true,
        data: { buffer },
      };
    }

    return { ok: false, error: "Unexpected response format" };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ==================== 智能发送 ====================

import { markdownToPost, hasMarkdown, type PostContent } from "./markdown.js";

/**
 * 发送 Post 格式消息（直接传 PostContent）
 */
export async function sendPost(
  account: ResolvedFeishuAccount,
  chatId: string,
  postContent: PostContent
): Promise<ApiResult<{ messageId: string }>> {
  const client = getFeishuClient(account);

  try {
    const result = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "post",
        content: JSON.stringify(postContent),
      },
    });

    if (result.code === 0) {
      return { ok: true, data: { messageId: result.data?.message_id || "" } };
    }
    return { ok: false, error: result.msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * 智能发送消息
 * - 检测 Markdown 格式，自动转换为 Post 富文本
 * - 普通文本直接发送
 */
export async function sendSmartMessage(
  account: ResolvedFeishuAccount,
  chatId: string,
  text: string,
  options?: { forceRichText?: boolean }
): Promise<ApiResult<{ messageId: string }>> {
  // 检测是否需要富文本
  const useRichText = options?.forceRichText || hasMarkdown(text);

  if (useRichText) {
    const postContent = markdownToPost(text);
    return sendPost(account, chatId, postContent);
  }

  return sendTextMessage(account, chatId, text);
}

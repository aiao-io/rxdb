/**
 * 请求体读取、JSON 响应与 `ETag` 计算。
 *
 * @remarks
 * 全部基于 `node:http` 原语，不引入任何框架——AC#1 要求 `dependencies` 为空。
 */

import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** 带 HTTP 状态码的业务错误。路由层统一翻成 `{ error, message }` + 该状态码。 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** 请求体上限。demo 的最大请求是 `by-ids` 的一块 id（`idChunkSize: 20`），离 1 MiB 差着数量级。 */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * 读取并解析 JSON 请求体。
 *
 * @throws {HttpError} 体积超限（413）或不是合法 JSON（400）。
 *
 * @remarks
 * 空体返回 `{}` 而不是抛错：`HEAD` / `GET` 走不到这里，但 `POST :entity/delete`
 * 被中间层剥掉 body 时，给出「缺 ids」的 400 比给出「JSON 解析失败」更接近真相。
 */
export const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') return {};

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
};

/**
 * 响应体 → 强校验符 `ETag`。
 *
 * @remarks
 * 直接对**序列化后的响应体**取哈希，而不是对「表的某个版本号」取值。
 * 协议里那条警告说得很重：内容变了却回 `304`，客户端会把还活着的远端行当孤儿删掉。
 * 以内容本身为准的哈希不可能出现这种偏差——序列化结果一样，那内容就是一样的。
 */
export const computeEtag = (body: string): string => `"${createHash('sha256').update(body).digest('hex')}"`;

/** 服务端生成的行 id。协议要求 `id` 由服务端定型，不能回显入参。 */
export const newRowId = (): string => randomUUID();

/** 服务端写入时刻，ISO 8601。协议要求时间字段是 ISO 串而不是 Unix 时间戳。 */
export const nowIso = (): string => new Date().toISOString();

/** 写一个 JSON 响应。`etag` 给出时同时写 `ETag` 头。 */
export const sendJson = (response: ServerResponse, status: number, payload: unknown, etag?: string): void => {
  const body = JSON.stringify(payload);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (etag !== undefined) response.setHeader('ETag', etag);
  response.writeHead(status);
  response.end(body);
};

/** 写一个无 body 的响应（`204` / `304` / `HEAD` 的回执）。 */
export const sendEmpty = (response: ServerResponse, status: number, etag?: string): void => {
  if (etag !== undefined) response.setHeader('ETag', etag);
  response.writeHead(status);
  response.end();
};

/**
 * 条件请求命中判定。
 *
 * @remarks
 * `If-None-Match` 允许逗号分隔的多个值，也允许 `*`。客户端只会回传上一次拿到的那一个，
 * 但参考实现按标准解析——照着这份代码写后端的人，他的客户端未必这么克制。
 */
export const matchesIfNoneMatch = (header: string | string[] | undefined, etag: string): boolean => {
  if (typeof header !== 'string' || header === '') return false;
  if (header.trim() === '*') return true;
  return header.split(',').some(candidate => candidate.trim().replace(/^W\//, '') === etag);
};

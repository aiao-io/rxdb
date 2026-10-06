/**
 * RV-031 回归：`POST /v1/recipes/metadata` 必须验证请求体是 JSON 对象，而不只是合法 JSON。
 *
 * @remarks
 * `readJsonBody` 的返回类型只是 `Promise<unknown>`——JSON parse 成功不代表结构正确。
 * `handleMetadata` 原先把结果直接断言成 `Record<string, unknown>`：`null` 读
 * `body['limit']` 抛 `TypeError`（兜底成 500），数组被当成「没带任何参数」的空查询接受
 * （200，返回种子数据）。两者都不是本协议端点要求的参数对象，应统一回 400。
 *
 * 用真实 `createDemoServer`（RxDB + pglite 落盘）起服务，不 mock handler——与
 * `server.spec.ts` 同一套夹具。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEED_ROW_COUNT } from '../config.ts';
import type { DemoServer } from '../server.ts';
import { createDemoServer } from '../server.ts';

let workdir: string;
let demo: DemoServer;
let baseUrl: string;

beforeEach(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'rv031-metadata-shape-'));
  demo = await createDemoServer({ dataDir: join(workdir, 'pglite'), exposeEtag: true, controlEnabled: true });
  await new Promise<void>(resolve => demo.server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/v1`;
});

afterEach(async () => {
  await demo.close();
  rmSync(workdir, { recursive: true, force: true });
});

/** 直发原始 body 文本——不经 `JSON.stringify`，好发出 `null` / `[]` / 标量这类字面量。 */
const postRaw = async (body: string): Promise<Response> =>
  await fetch(`${baseUrl}/recipes/metadata`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  });

describe('RV-031 —— metadata 请求体形状校验', () => {
  it('{"limit":1} 正常查询', async () => {
    const response = await postRaw('{"limit":1}');
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
  });

  it('空对象 {} 按默认参数查询，不是报错', async () => {
    const response = await postRaw('{}');
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(Math.min(SEED_ROW_COUNT, 1000));
  });

  it('null 是合法 JSON，但不是参数对象——400 而不是 500', async () => {
    const response = await postRaw('null');
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('bad_request');
  });

  it('数组是合法 JSON，但不是参数对象——400 而不是被当成空参数接受', async () => {
    const response = await postRaw('[]');
    expect(response.status).toBe(400);
  });

  it('标量（字符串 / 数字 / 布尔）同样拒绝为 400', async () => {
    for (const body of ['"x"', '5', 'true']) {
      const response = await postRaw(body);
      expect(response.status, `body=${body}`).toBe(400);
    }
  });

  it('字段类型错误（limit 不是整数）400，不影响对象形状校验的独立性', async () => {
    const response = await postRaw('{"limit":"abc"}');
    expect(response.status).toBe(400);
  });

  it('超过 1 MiB 的 body 回 413，不受对象形状校验影响', async () => {
    const response = await postRaw(JSON.stringify({ where: 'x'.repeat(1024 * 1024) }));
    expect(response.status).toBe(413);
  });
});

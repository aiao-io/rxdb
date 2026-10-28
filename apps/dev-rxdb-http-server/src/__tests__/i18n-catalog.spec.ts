import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoServer, type DemoServer } from '../server.ts';

const GREETING_ID = JSON.stringify(['en', 'http-demo', 'greeting']);
const STATUS_ID = JSON.stringify(['en', 'http-demo', 'status']);
interface MessageRow {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  value: string;
  source: string;
  updatedAt: string;
}
let workdir: string;
let demo: DemoServer;
let baseUrl: string;
const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

beforeEach(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'us911-http-catalog-'));
  demo = await createDemoServer({ dataDir: join(workdir, 'pglite'), exposeEtag: true, controlEnabled: true });
  await new Promise<void>(resolve => demo.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/v1`;
});
afterEach(async () => {
  await demo.close();
  rmSync(workdir, { recursive: true, force: true });
});

describe('远端国际化目录协议', () => {
  it('metadata/by-ids提供真实持久目录，单条更新推进时间戳，删除只移除目标远端消息', async () => {
    const metadata = await post('messages/metadata', { limit: 1, offset: 0 });
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toHaveLength(1);
    const byIds = await post('messages/by-ids', { ids: [GREETING_ID, STATUS_ID] });
    const rows = (await byIds.json()) as MessageRow[];
    expect(rows.map(row => row.id).sort()).toEqual([GREETING_ID, STATUS_ID].sort());
    const original = rows.find(row => row.id === GREETING_ID) as MessageRow;
    const updated = await fetch(`${baseUrl}/messages/${encodeURIComponent(GREETING_ID)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'Remote greeting v2' })
    });
    expect(updated.status).toBe(200);
    const changed = (await updated.json()) as MessageRow;
    expect(changed.value).toBe('Remote greeting v2');
    expect(new Date(changed.updatedAt).getTime()).toBeGreaterThan(new Date(original.updatedAt).getTime());
    expect((await post('messages/delete', { ids: [GREETING_ID] })).status).toBe(200);
    const remaining = await post('messages/by-ids', { ids: [GREETING_ID, STATUS_ID] });
    expect(((await remaining.json()) as MessageRow[]).map(row => row.id)).toEqual([STATUS_ID]);
  });

  it('非法ICU写入在落库之前被拒绝，已有文案保持原值', async () => {
    const response = await fetch(`${baseUrl}/messages/${encodeURIComponent(GREETING_ID)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: '{broken' })
    });
    expect(response.status).toBe(400);
    const rows = (await (await post('messages/by-ids', { ids: [GREETING_ID] })).json()) as MessageRow[];
    expect(rows[0].value).toBe('Remote greeting v1');
  });
});

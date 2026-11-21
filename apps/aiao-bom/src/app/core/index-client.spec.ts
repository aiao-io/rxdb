import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexClient } from './index-client';
import type { IndexReply, IndexRequest } from './index.worker';
import { makeStressDataset } from './stress-data';
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<IndexReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: IndexRequest | null = null;
  terminated = false;
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(value: IndexRequest): void {
    this.request = value;
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(value: Omit<IndexReply, 'id'>): void {
    this.onmessage?.(new MessageEvent('message', { data: { ...value, id: this.request!.id } }));
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  TestWorker.instances = [];
});
describe('索引 Worker 请求边界', () => {
  it('任务返回、取消、领域错误与运行错误都清理 Worker', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const client = new IndexClient();
    const first = client.build(20, 'wide');
    const worker = TestWorker.instances[0];
    worker.reply({ dataset: makeStressDataset(20), rows: [] });
    expect((await first).dataset.parts).toHaveLength(20);
    expect(worker.terminated).toBe(true);
    const cancelled = client.build(30, 'wide');
    const rejection = expect(cancelled).rejects.toThrow('取消');
    client.cancel();
    await rejection;
    const invalid = client.build(1, 'wide');
    const invalidResult = expect(invalid).rejects.toThrow('非法结构');
    TestWorker.instances.at(-1)!.reply({ error: '非法结构' });
    await invalidResult;
    const crashed = client.build(1, 'wide');
    const crashResult = expect(crashed).rejects.toThrow('crash');
    TestWorker.instances.at(-1)!.onerror?.(new ErrorEvent('error', { message: 'crash' }));
    await crashResult;
  });
});

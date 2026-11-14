import type { IndexReply } from './index.worker';
import type { BomDataset, BomRow } from './types';
export class IndexClient {
  private worker: Worker | null = null;
  private reject: ((reason: Error) => void) | null = null;
  private sequence = 0;
  build(count: number, shape: 'balanced' | 'wide' | 'deep'): Promise<{ dataset: BomDataset; rows: BomRow[] }> {
    this.cancel();
    const id = ++this.sequence;
    this.worker = new Worker(new URL('./index.worker', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker!.onmessage = (event: MessageEvent<IndexReply>) => {
        if (event.data.id !== id) return;
        const reply = event.data;
        if (reply.error || !reply.dataset || !reply.rows) reject(new Error(reply.error ?? '索引任务未返回完整结果'));
        else resolve({ dataset: reply.dataset, rows: reply.rows });
        this.reject = null;
        this.worker?.terminate();
        this.worker = null;
      };
      this.worker!.onerror = event => {
        reject(new Error(event.message));
        this.reject = null;
        this.worker?.terminate();
        this.worker = null;
      };
      this.worker!.postMessage({ id, count, shape, structure: 'catalog' });
    });
  }
  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
    this.reject?.(new DOMException('索引任务已取消', 'AbortError'));
    this.reject = null;
  }
}

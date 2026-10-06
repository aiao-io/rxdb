import { describe, expect, it, vi } from 'vitest';
import { Oo1ClientBase, type Oo1ClientLoadOptions } from '../Oo1ClientBase.js';
import type { Oo1Database, Oo1Static } from '../oo1-types.js';

class DeferredOo1Client extends Oo1ClientBase<Oo1ClientLoadOptions> {
  protected get clientName(): string {
    return 'review-parallel-oo1';
  }

  constructor(private readonly load: () => Promise<Oo1Static>) {
    super();
  }

  protected loadModule(): Promise<Oo1Static> {
    return this.load();
  }
}

describe('并行评审：oo1 在途加载的关闭屏障', () => {
  it('loadModule 晚到不能重新激活已 disconnect 的客户端', async () => {
    const gate = Promise.withResolvers<Oo1Static>();
    const close = vi.fn();
    const db = {
      close,
      changes: () => 0,
      createFunction: vi.fn(),
      exec: vi.fn()
    } as unknown as Oo1Database;
    const runtime = {
      oo1: {
        DB: class {
          constructor() {
            return db;
          }
        }
      },
      capi: { sqlite3_update_hook: vi.fn() }
    } as unknown as Oo1Static;
    const client = new DeferredOo1Client(() => gate.promise);
    const initializing = client.init('late-oo1');
    const stopping = client.disconnect();
    await Promise.race([stopping, new Promise<void>(resolve => setTimeout(resolve, 0))]);
    gate.resolve(runtime);
    try {
      await Promise.allSettled([initializing, stopping]);
      expect(close).toHaveBeenCalledTimes(1);
      await expect(client.execute('SELECT 1')).rejects.toThrow(/disconnected|initialized/);
    } finally {
      await client.disconnect();
    }
  });
});

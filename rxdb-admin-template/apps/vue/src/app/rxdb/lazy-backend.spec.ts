import { firstValueFrom } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ loaded: vi.fn() }));

vi.mock('@aiao/rxdb-adapter-sqlite-wasm', async importOriginal => {
  backend.loaded();
  return importOriginal<typeof import('@aiao/rxdb-adapter-sqlite-wasm')>();
});

// 冷导入 setup_rxdb 要现编整套 RxDB 依赖：全量并行跑时单这一步就超过默认的 5 秒用例时限，
// 而它不是本用例要测的东西。导入放进 beforeAll 并给足时限，用例只计「创建 → 取适配器」。
// 断言的区分力不变：导入若提前加载了后端，backend.loaded 的计数会在用例开头被抓到。
let setup: typeof import('./setup_rxdb');
/** 一个登录账号的本机库身份：没有身份时工作台是不注册适配器的占位实例（ADMIN-US-222）。 */
const identity = { scope: 'https://project.supabase.co', subject: '0191b2c4-7f3a-7c1e-9d4b-2a6f8e1c5b30' };
beforeAll(async () => {
  setup = await import('./setup_rxdb');
}, 60_000);

describe('工作台数据库后端按需加载', () => {
  it('创建工作台时不加载后端，首次并发取得适配器时只加载一次且不连接空库', async () => {
    const database = setup.createWorkbenchDatabase(undefined, identity);
    try {
      expect(backend.loaded).not.toHaveBeenCalled();
      const [first, second] = await Promise.all([
        database.getAdapter('sqlite-wasm'),
        database.getAdapter('sqlite-wasm')
      ]);
      expect(backend.loaded).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
      expect(first.options.vfs).toBe('idb');
      expect(await firstValueFrom(database.adapterConnected$('sqlite-wasm'))).toBe(false);
    } finally {
      await database.destroy();
    }
    // 用例本身含一次后端模块的冷导入（正是被测的按需加载，不能预热），时限按冷导入给。
  }, 30_000);
});

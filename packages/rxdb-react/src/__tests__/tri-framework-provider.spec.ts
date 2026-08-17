/**
 * 三端 provider 契约 —— React 侧。
 *
 * @remarks
 * 断言全部在**编译期**成立：`@ts-expect-error` 由 `nx typecheck rxdb-react`
 * （`tsc -p tsconfig.spec.json --noEmit`）校验 —— 指令下的那行若不再报错，
 * tsc 会以 TS2578「Unused '@ts-expect-error' directive」失败。运行时的 `expect`
 * 只是让用例非空，不承担类型校验。
 *
 * 锁的是三框架对称铁律在 provider 上的落点：同一个 {@link RxDBSource} 联合类型、
 * 同一对读取语义（严格 / 可选）。任一端单方面收紧或放宽，对应端的同名用例就会失败。
 * 异步形态本身是 US-207 E11 的前提 —— 桌面分支要走动态 `import()` 才不会被打进 web bundle，
 * 而 `await import()` 只能给出 Promise。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-angular/src/__tests__/tri-framework-provider.spec.ts`
 * - `packages/rxdb-vue/src/__tests__/tri-framework-provider.spec.ts`
 */
import { RxDB } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { useRxDB, useRxDBOptional, type ProviderProps, type RxDBSource } from '../index';

/** 编译期占位：这些函数体永不执行。 */
const ready = (): RxDB => undefined as unknown as RxDB;

describe('三端 provider 契约', () => {
  describe('RxDBSource 接受四种数据库形态', () => {
    it('实例 / Promise / 同步工厂 / 异步工厂都被接受', () => {
      const asInstance: RxDBSource<RxDB> = ready();
      const asPromise: RxDBSource<RxDB> = Promise.resolve(ready());
      const asSyncFactory: RxDBSource<RxDB> = () => ready();
      const asAsyncFactory: RxDBSource<RxDB> = async () => ready();

      expect([asInstance, asPromise, asSyncFactory, asAsyncFactory]).toHaveLength(4);
    });

    it('null 被编译期拒绝', () => {
      // @ts-expect-error null 不是合法 source：三端都要求显式给出数据库
      const asNull: RxDBSource<RxDB> = null;

      expect(asNull).toBeNull();
    });
  });

  describe('读取分严格与可选两条', () => {
    it('useRxDB 返回非空实例', () => {
      const read = (): RxDB => useRxDB();

      expect(read).toBeTypeOf('function');
    });

    it('useRxDBOptional 可能为 undefined，不能直接当 RxDB 用', () => {
      const read = (): RxDB | undefined => useRxDBOptional();
      const misuse = (): RxDB =>
        // @ts-expect-error 未就绪时是 undefined —— 可选读取必须由调用方显式收窄
        useRxDBOptional();

      expect([read, misuse]).toHaveLength(2);
    });
  });

  describe('provider 入口接受同一个联合类型', () => {
    it('RxDBProvider 的 db prop 收 RxDBSource', () => {
      const accept = (source: RxDBSource<RxDB>): ProviderProps<RxDB> => ({ db: source });

      expect(accept).toBeTypeOf('function');
    });
  });
});

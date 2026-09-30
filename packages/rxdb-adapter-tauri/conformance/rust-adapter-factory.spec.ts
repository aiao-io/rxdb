/**
 * `rust-adapter-factory.ts` 的查询计数契约单测。
 *
 * @remarks
 * 只测 `getQueryCount` 是否已迁移到 `@aiao/rxdb-test/encrypted` 的共享实现——不需要真的起
 * Rust 宿主：迁移前后唯一的行为差异是「未登记对象该不该抛」，与宿主进程无关，因此这里不调用
 * `createAdapter()` / `createClient()`，全程不会触发宿主进程的惰性启动。真正跑通宿主的端到端
 * 验证见同目录 `encrypted-crud.spec.ts` 等套件。
 *
 * @module conformance/rust-adapter-factory.spec
 */
import { queryCountOf, type EncryptedTestAdapter } from '@aiao/rxdb-test/encrypted';
import { describe, expect, it } from 'vitest';

import { rustEncryptedAdapterFactory } from './rust-adapter-factory.js';

describe('rustEncryptedAdapterFactory.getQueryCount', () => {
  // 七个已迁移的工厂（wa-sqlite / sqlite-wasm / sqliteai / pglite / sqlite-official /
  // electron×2）全部写成 `getQueryCount: queryCountOf`：直接复用共享实现，而不是各自
  // `new WeakMap()` 再重新发明一遍「查不到怎么办」。这里断言引用相等，把「必须复用共享
  // 契约」钉成可回归的事实，而不是靠人肉比对源码。
  it('复用 `@aiao/rxdb-test/encrypted` 的共享实现，而不是本地重新发明', () => {
    expect(rustEncryptedAdapterFactory.getQueryCount).toBe(queryCountOf);
  });

  // 契约见 `types.ts` 里 `EncryptedAdapterFactory.getQueryCount` 的 TSDoc：读不到必须抛错，
  // 不许兜底成 0——兜底会让 `expectRejectedBeforeQuery`（crud.suite.ts）「调用前后计数不变」
  // 的断言在登记表打空时变成 `0 === 0` 的空断言，整批「加密列泄漏必须拦在 SQL 之前」的用例
  // 静默失去意义。
  it('未登记的 adapter 必须抛错，不能兜底成 0', () => {
    const unregistered = {} as unknown as EncryptedTestAdapter;
    expect(() => rustEncryptedAdapterFactory.getQueryCount(unregistered)).toThrow(/registerQueryCount/);
  });
});

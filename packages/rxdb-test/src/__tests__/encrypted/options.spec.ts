import { describe, expect, expectTypeOf, it } from 'vitest';

import { runCrudSuite } from '../../encrypted/crud.suite.js';
import { runLifecycleSuite } from '../../encrypted/lifecycle.suite.js';
import { runTamperSuite } from '../../encrypted/tamper.suite.js';
import type {
  EncryptedAdapterFactory,
  EncryptedSuiteOptions,
  EncryptedTestAdapter,
  ReadDatabaseFile
} from '../../encrypted/types.js';

const factory = {
  name: 'type-contract',
  getQueryCount: () => 0,
  async createAdapter(): Promise<EncryptedTestAdapter> {
    throw new Error('type-only factory must not execute');
  }
} satisfies EncryptedAdapterFactory;

const typeArgumentRejected = (): Promise<unknown> =>
  // @ts-expect-error createAdapter 不再接受类型参数（RXT-024）
  factory.createAdapter<{ anything: string }>();

// RXT-024 的类型负例。`createAdapter` 的返回类型必须由**套件**规定，
// 而不是由调用方通过 `<T>` 指定 —— 后者等于在公开 API 里内置一次强制断言，
// adapter 少实现一个方法要到运行时才炸。
// 注意 finding 原文说「返回 `{}` 的 factory 也能通过类型检查」—— 那句是**错的**：
// 具体返回类型本来就不满足 `Promise<T>`，写成那样的负例今天就已经红了。
// 「factory 自带泛型再 `as T`」同样不是判据 —— TS 会把 `<T>() => Promise<T>`
// 实例化成目标签名，照样放行。
//
// 真正的判据在**调用点**：`createAdapter` 不再接受类型参数，
// 调用方没法再指定自己想要什么。下面那行 `@ts-expect-error` 一旦「未使用」，
// 说明泛型又被放回公开契约里，typecheck 立刻转红。

describe('encrypted suite option contracts', () => {
  it('does not let the caller pick the adapter type (RXT-024)', () => {
    expectTypeOf(factory.createAdapter).returns.resolves.toEqualTypeOf<EncryptedTestAdapter>();
    expect(typeof typeArgumentRejected).toBe('function');
    expect(factory.name).toBe('type-contract');
  });

  it('does not require a database reader for suites that never consume one', () => {
    const options: EncryptedSuiteOptions = { factory };

    expect(options.factory).toBe(factory);
    expectTypeOf<Parameters<typeof runLifecycleSuite>[0]>().toEqualTypeOf<EncryptedSuiteOptions>();
    expectTypeOf<Parameters<typeof runTamperSuite>[0]>().toEqualTypeOf<EncryptedSuiteOptions>();
  });

  it('keeps the persisted-state reader mandatory for the CRUD sentinel scan', () => {
    expectTypeOf<Parameters<typeof runCrudSuite>[0]>().toMatchTypeOf<{
      readDatabaseFile: ReadDatabaseFile;
    }>();
  });
});

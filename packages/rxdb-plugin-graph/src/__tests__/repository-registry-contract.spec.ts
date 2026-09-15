/**
 * `GraphRepository` 在门面轴注册表里的类型契约（US-025 阶段 A：A1）。
 *
 * 装了本插件之后，`@Entity({ repository: … })` 处的补全里必须出现 `'GraphRepository'`，
 * 与核心的 `'Repository'` / `'TreeRepository'` 同为一等公民 —— 而不是落到
 * `RxDBRepositoryName` 的 `(string & {})` 那一支上、一个字都补不出来。
 *
 * 这条断言的红态是编译期的：`plugin.ts` 里的 `declare module` 一旦被删或改名，
 * `keyof RxDBRepositories` 就不再含 `'GraphRepository'`，本文件直接编译失败。
 */
import type { EntityMetadataOptions, RxDBRepositories, RxDBRepositoryName } from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { GraphRepository } from '../GraphRepository.js';
import '../plugin.js';

describe('GraphRepository 门面轴注册', () => {
  it('A1 `GraphRepository` 经 declare module 进注册表，与核心两个门面同级', () => {
    expectTypeOf<'GraphRepository'>().toExtend<keyof RxDBRepositories>();
    expectTypeOf<'Repository'>().toExtend<keyof RxDBRepositories>();
    expectTypeOf<'TreeRepository'>().toExtend<keyof RxDBRepositories>();
    // 索引签名会让 keyof 塌成 string，上面三条随之退化成恒真
    expectTypeOf<keyof RxDBRepositories>().not.toEqualTypeOf<string>();
    expect(GraphRepository).toBeTypeOf('function');
  });

  it('A1 `@Entity({ repository })` 收得下这个名字', () => {
    const options = { name: 'GraphNode', repository: 'GraphRepository' } satisfies Pick<
      EntityMetadataOptions,
      'name' | 'repository'
    >;

    expectTypeOf<EntityMetadataOptions['repository']>().toEqualTypeOf<RxDBRepositoryName | undefined>();
    expect(options.repository).toBe('GraphRepository');
  });
});

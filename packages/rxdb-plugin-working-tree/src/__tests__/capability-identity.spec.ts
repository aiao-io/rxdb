/**
 * @fileoverview 本包身份（能力名 + 包说明符）的漂移防线。
 *
 * @remarks
 * {@link PACKAGE_SPECIFIER} 是一个**手写字面量**，而未认领能力守卫把它原样报给用户去
 * `pnpm add`（见 `capability-identity.ts` 的 @fileoverview）。它与 `package.json` 的 `name`
 * 之间没有任何编译期联系：改包名、加 scope、拼错一个字符，都不会让任何 target 变红——
 * 只会让守卫在一个真出问题的库上告诉用户去装一个**不存在的包**。而「拒绝连接并报出该装
 * 什么」正是抽包这件事的核心收益，报错指错了包等于把这份收益悄悄废掉。
 *
 * 下面这两节分别钉住两段链路：
 *
 * 1. **身份本身** —— 常量与 `package.json` 一致，且贡献声明确实带着它（不是声明里另写了
 *    一份字面量）。
 * 2. **进出守卫的往返** —— 用本包真实的三个值，经**核心真实的**编解码与守卫走一圈，断言
 *    错误文案里出现的就是可安装的包名。这一节不造任何假行名：假行名只能证明守卫会解析
 *    「长这样的字符串」，证明不了本包写出去的**那一条**能被读回来。
 *
 * 跨包的另一半（守卫确实挂在真实 `connect()` 路径上、且建表之前就拒绝）由核心的
 * `__tests__/system/plugin-system-contribution.spec.ts`「未认领能力守卫」一节覆盖，
 * 本文件不重复；两者合起来才是完整链路。
 */

import {
  assertClaimedCapabilities,
  capabilityWatermarkName,
  parseCapabilityWatermark,
  RxDB,
  RXDB_CAPABILITY_WATERMARK_PREFIX,
  SyncType,
  UnclaimedRxDBCapabilityError
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { PACKAGE_SPECIFIER, WORKING_TREE_CAPABILITY } from '../capability-identity.js';
import { RxDBPluginWorkingTree, WORKING_TREE_CAPABILITY_VERSION } from '../plugin.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

/** 一个没 `init()` 过的宿主；读 `system` 不需要连接（同 `system-entity-registration.spec.ts`）。 */
const createDatabase = (): RxDB => {
  const database = new RxDB({
    dbName: `rxdb-capability-identity-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
};

/**
 * 宿主在 `use()` 那一刻读到的那份声明。
 *
 * 经**类**而不是 `rxDBPluginWorkingTree` 工厂取，理由同 `system-entity-registration.spec.ts`：
 * `IRxDBPlugin.system` 是可选成员，走工厂要先 `!` 或加守卫，而那会让「到底声明了没有」
 * 在本文件里失去答案。
 */
const CONTRIBUTION = new RxDBPluginWorkingTree(createDatabase()).system;

describe('本包身份', () => {
  it('PACKAGE_SPECIFIER 必须与 package.json 的 name 逐字一致', () => {
    expect(PACKAGE_SPECIFIER).toBe(packageJson.name);
  });

  it('贡献声明带的就是这三个常量，不是另抄的一份字面量', () => {
    expect({
      capability: CONTRIBUTION.capability,
      version: CONTRIBUTION.version,
      packageSpecifier: CONTRIBUTION.packageSpecifier
    }).toEqual({
      capability: WORKING_TREE_CAPABILITY,
      version: WORKING_TREE_CAPABILITY_VERSION,
      packageSpecifier: PACKAGE_SPECIFIER
    });
  });
});

describe('本包写出的认领行走一趟真实守卫', () => {
  /** 本包启用时**实际**落进 `rxdb_migration` 的那一行行名。 */
  const WATERMARK_NAME = capabilityWatermarkName(CONTRIBUTION);

  it('行名由核心编码器算出，带前缀且三段可原样解回', () => {
    expect(WATERMARK_NAME.startsWith(RXDB_CAPABILITY_WATERMARK_PREFIX)).toBe(true);
    // 包名自带一个 `:`（scope 的分隔符在 `@` 之后没有，但第三段本身允许含 `:`）——
    // 解码器按前两个 `:` 切，第三段取剩余全部。写死期望值而不是回比 CONTRIBUTION，
    // 是要让「谁改了编码格式」在这里当场可见。
    expect(WATERMARK_NAME).toBe('__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree');
    expect(parseCapabilityWatermark(WATERMARK_NAME)).toEqual({
      capability: WORKING_TREE_CAPABILITY,
      version: WORKING_TREE_CAPABILITY_VERSION,
      packageSpecifier: PACKAGE_SPECIFIER
    });
  });

  it('没人认领时守卫拒绝，且文案里给出的是可以直接安装的包名', () => {
    let thrown: unknown;
    try {
      assertClaimedCapabilities([WATERMARK_NAME], new Set());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnclaimedRxDBCapabilityError);
    // 断言的是**文案**而不只是 `claims`：用户看到的是消息，而消息里那个名字要能直接
    // 粘进 `pnpm add`。只比对结构化字段的话，渲染那一行漏掉包名不会有任何测试变红。
    expect((thrown as UnclaimedRxDBCapabilityError).message).toContain(packageJson.name);
    expect((thrown as UnclaimedRxDBCapabilityError).claims).toEqual([
      {
        capability: WORKING_TREE_CAPABILITY,
        version: WORKING_TREE_CAPABILITY_VERSION,
        packageSpecifier: PACKAGE_SPECIFIER
      }
    ]);
  });

  it('本插件在场时同一行被认领，守卫放行', () => {
    expect(() => assertClaimedCapabilities([WATERMARK_NAME], new Set([CONTRIBUTION.capability]))).not.toThrow();
  });
});

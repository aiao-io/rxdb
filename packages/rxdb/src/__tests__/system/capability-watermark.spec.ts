/**
 * @fileoverview 能力认领水位与「未认领能力守卫」的纯函数面。
 *
 * @remarks
 * 守卫要防的事故没有任何编译期形态：一个装过工作树插件的库，被一个**没装**该插件的客户端打开，
 * 那 10 张表照样在，写原语却一层拦截都没有——用户编辑安静地绕过写捕获，工作树与真实数据分叉。
 * 今天挡住它的是 `RXDB_SYSTEM_SCHEMA_VERSION` 这个全库性的闸门（旧客户端一律拒之门外）；
 * 抽包之后闸门归零，只剩这道按能力归因的守卫。
 *
 * 因此本文件的断言集中在两件事上：**行名能原样往返**（写进去的包名要能被读出来报给用户），
 * 以及**带前缀但读不懂的行一律抛错**（新格式若被当成「不认识，跳过」，守卫就等于没有）。
 */

import { describe, expect, it } from 'vitest';
import {
  assertClaimedCapabilities,
  capabilityWatermarkName,
  MalformedRxDBCapabilityWatermarkError,
  parseCapabilityWatermark,
  RXDB_CAPABILITY_WATERMARK_PREFIX,
  UnclaimedRxDBCapabilityError
} from '../../system/capability-watermark.js';

const CLAIM = {
  capability: 'workingTree',
  version: 1,
  packageSpecifier: '@aiao/rxdb-plugin-working-tree'
} as const;

describe('能力认领水位的行名编解码', () => {
  it('行名带前缀，三段按 capability:version:packageSpecifier 拼', () => {
    expect(capabilityWatermarkName(CLAIM)).toBe(
      `${RXDB_CAPABILITY_WATERMARK_PREFIX}workingTree:1:@aiao/rxdb-plugin-working-tree`
    );
  });

  it('编码后解码回同一个三元组（包名要能原样报给用户）', () => {
    expect(parseCapabilityWatermark(capabilityWatermarkName(CLAIM))).toEqual(CLAIM);
  });

  it('包名里的 : 不会被切断（scope 之外的第三段整体保留）', () => {
    const claim = { ...CLAIM, packageSpecifier: 'https://example.com:8443/plugin' };
    expect(parseCapabilityWatermark(capabilityWatermarkName(claim))).toEqual(claim);
  });

  it('不带前缀的迁移名返回 undefined，而不是抛错', () => {
    expect(parseCapabilityWatermark('0004-working-tree-commits')).toBeUndefined();
    expect(parseCapabilityWatermark('__rxdb_system_schema__:5')).toBeUndefined();
  });

  it.each([
    ['缺第三段', `${RXDB_CAPABILITY_WATERMARK_PREFIX}workingTree:1`],
    ['版本非正整数', `${RXDB_CAPABILITY_WATERMARK_PREFIX}workingTree:0:@pkg`],
    ['版本不是数字', `${RXDB_CAPABILITY_WATERMARK_PREFIX}workingTree:next:@pkg`],
    ['能力名为空', `${RXDB_CAPABILITY_WATERMARK_PREFIX}:1:@pkg`],
    ['包名为空', `${RXDB_CAPABILITY_WATERMARK_PREFIX}workingTree:1:`]
  ])('带前缀但读不懂的行抛错而不是跳过（%s）', (_label, name) => {
    expect(() => parseCapabilityWatermark(name)).toThrow(MalformedRxDBCapabilityWatermarkError);
  });
});

describe('未认领能力守卫', () => {
  const claimedRow = capabilityWatermarkName(CLAIM);

  it('库里有能力行、本进程认领了它 —— 放行', () => {
    expect(() => assertClaimedCapabilities([claimedRow], new Set(['workingTree']))).not.toThrow();
  });

  it('库里没有能力行 —— 放行（未装插件的普通库）', () => {
    expect(() => assertClaimedCapabilities(['0004-working-tree-commits'], new Set())).not.toThrow();
  });

  it('库里有能力行、无人认领 —— 拒绝，且报错里带上该装的包名', () => {
    let thrown: unknown;
    try {
      assertClaimedCapabilities([claimedRow], new Set());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnclaimedRxDBCapabilityError);
    expect((thrown as UnclaimedRxDBCapabilityError).claims).toEqual([CLAIM]);
    // 包名是插件自己写进行里的，所以第三方插件同样能产出可执行的报错。
    expect((thrown as Error).message).toContain('@aiao/rxdb-plugin-working-tree');
    expect((thrown as Error).message).toContain('workingTree');
  });

  it('同一能力的多个版本行只报最高的那一条（升级过的库不刷屏）', () => {
    const v2 = capabilityWatermarkName({ ...CLAIM, version: 2 });
    let thrown: UnclaimedRxDBCapabilityError | undefined;
    try {
      assertClaimedCapabilities([claimedRow, v2], new Set());
    } catch (error) {
      thrown = error as UnclaimedRxDBCapabilityError;
    }
    expect(thrown?.claims).toEqual([{ ...CLAIM, version: 2 }]);
  });

  it('认领的是别的能力 —— 仍然拒绝（守卫按能力归因，不是按「装了任意插件」）', () => {
    expect(() => assertClaimedCapabilities([claimedRow], new Set(['search']))).toThrow(UnclaimedRxDBCapabilityError);
  });
});

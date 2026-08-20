/**
 * `IRxDBPlugin` 成员形状的编译期契约（US-014 AC#18 / D4）。
 *
 * API 基线里 `IRxDBPlugin` 只记了 `{"name":"IRxDBPlugin","kind":"type"}` ——
 * 把 `install()` 改签名、把 `destroy()` 变可选、给 `lifecycle` 换取值，
 * `api-surface.mjs --check` 全都不产生 diff。**CI 绿在这条变更上不构成任何证据。**
 *
 * 因此这份契约由类型检查兜底：`expectTypeOf` 与 `@ts-expect-error` 在运行时都是空操作，
 * 真正的门禁是 `pnpm nx typecheck rxdb`（`tsconfig.spec.json` 收录了本文件）。
 */
import type { LifecycleScope } from '@aiao/utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IRxDBPlugin } from '../../rxdb-plugin.js';

/** 新契约插件：声明 `lifecycle`、完全不写 `destroy`。`destroy` 变回必选时本类编译不过。 */
class ScopedPlugin implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name = 'scopedPlugin' as const;

  install(scope: LifecycleScope): void {
    scope.acquire(() => undefined, 'noop');
  }
}

/** 旧契约插件（AC#6）：无参 `install()` + `destroy()`，不声明 `lifecycle`。 */
class LegacyPlugin implements IRxDBPlugin {
  readonly name = 'legacyPlugin' as const;

  install(): void {
    // 实现方少写形参不破坏契约 —— 这正是 D1 「零编译破坏」的判据
  }

  destroy(): void {
    // 旧契约的拆卸出口仍然存在，运行时仍被调用
  }
}

/** 双版本插件（D6）：两样都写，靠 `lifecycle` 标记让新宿主只清理一次。 */
class DualVersionPlugin implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name = 'dualVersionPlugin' as const;

  install(scope: LifecycleScope): void {
    scope.acquire(() => undefined, 'noop');
  }

  destroy(): void {
    // 只有旧宿主会走到这里
  }
}

describe('IRxDBPlugin 成员形状契约', () => {
  it('install 的唯一形参是 LifecycleScope', () => {
    expectTypeOf<IRxDBPlugin['install']>().parameter(0).toEqualTypeOf<LifecycleScope>();
    expectTypeOf<Parameters<IRxDBPlugin['install']>['length']>().toEqualTypeOf<1>();
    expectTypeOf<IRxDBPlugin['install']>().returns.toEqualTypeOf<void | Promise<void>>();

    expect(new ScopedPlugin().name).toBe('scopedPlugin');
  });

  it('destroy 与 lifecycle 均为可选成员', () => {
    // 一个成员都不写也能 implements：destroy 若变回必选，ScopedPlugin 编译不过
    expectTypeOf<ScopedPlugin>().toExtend<IRxDBPlugin>();
    // 旧插件零编译破坏：install 少写形参 + 不声明 lifecycle（AC#6）
    expectTypeOf<LegacyPlugin>().toExtend<IRxDBPlugin>();
    // 双版本插件两样都写也合法（D6）
    expectTypeOf<DualVersionPlugin>().toExtend<IRxDBPlugin>();

    expectTypeOf<IRxDBPlugin['destroy']>().toEqualTypeOf<(() => void | Promise<void>) | undefined>();

    expect(new LegacyPlugin().destroy()).toBeUndefined();
  });

  it('lifecycle 只接受 scoped 字面量', () => {
    expectTypeOf<IRxDBPlugin['lifecycle']>().toEqualTypeOf<'scoped' | undefined>();

    // @ts-expect-error 取值放宽成 string 时，这行抑制会变成多余的 @ts-expect-error 而报错
    const unknownMarker: IRxDBPlugin['lifecycle'] = 'legacy';

    expect(unknownMarker).toBe('legacy');
  });
});

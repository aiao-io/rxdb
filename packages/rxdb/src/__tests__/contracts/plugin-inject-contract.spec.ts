/**
 * `IRxDBPlugin.inject` 与 `RxDBPluginDependency` 的编译期契约（US-015 D1 / AC#18）。
 *
 * 与 [plugin-scope-contract.spec.ts](./plugin-scope-contract.spec.ts) 同理：API 基线只记
 * `{"name":"RxDBPluginDependency","kind":"type"}` 一行，把封闭取值放宽成 `string`、
 * 把 `inject` 从 `readonly` 改成可变、把前缀从 `plugin:` 换成别的，
 * `api-surface.mjs --check` 全都不产生 diff。**CI 绿在这条变更上不构成任何证据。**
 *
 * 真正的门禁是 `pnpm nx typecheck rxdb`（`tsconfig.spec.json` 收录了本文件）：
 * `expectTypeOf` 与 `@ts-expect-error` 在运行时都是空操作，多余的抑制注释会让类型检查失败。
 */
import type { LifecycleScope } from '@aiao/utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IRxDBPlugin, RxDBPluginDependency } from '../../rxdb-plugin.js';

/** 声明了依赖的插件：`as const` 推出的只读元组必须能赋给 `inject`。 */
class InjectingPlugin implements IRxDBPlugin {
  readonly inject = ['adapter:local'] as const;
  readonly lifecycle = 'scoped' as const;
  readonly name = 'injectingPlugin' as const;

  install(scope: LifecycleScope): void {
    scope.acquire(() => undefined, 'noop');
  }
}

/** 不声明 `inject` 的插件仍然合法——这是「零编译破坏」的判据（US-015 AC#1 的另一半）。 */
class NoInjectPlugin implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name = 'noInjectPlugin' as const;

  install(scope: LifecycleScope): void {
    scope.acquire(() => undefined, 'noop');
  }
}

describe('RxDBPluginDependency 取值契约（D1 六种写法）', () => {
  it('三种合法写法：两个内置适配器键 + plugin: 前缀的小写开头插件名', () => {
    const local: RxDBPluginDependency = 'adapter:local';
    const remote: RxDBPluginDependency = 'adapter:remote';
    const pluginRef: RxDBPluginDependency = 'plugin:search';

    expect([local, remote, pluginRef]).toEqual(['adapter:local', 'adapter:remote', 'plugin:search']);
  });

  it('三种非法写法编译失败：裸名 / 大写开头 / 任意串', () => {
    // @ts-expect-error 裸名缺少 `plugin:` 前缀；放开成 string 时本行抑制会变成多余的 @ts-expect-error
    const bareName: RxDBPluginDependency = 'search';
    // @ts-expect-error 插件名是 Uncapitalize<string>，大写开头查表必然落空
    const capitalized: RxDBPluginDependency = 'plugin:Search';
    // @ts-expect-error 未知前缀不在封闭取值内（INV-1）
    const arbitrary: RxDBPluginDependency = 'service:logger';

    expect([bareName, capitalized, arbitrary]).toEqual(['search', 'plugin:Search', 'service:logger']);
  });

  it('adapter 键本身也是封闭的', () => {
    // @ts-expect-error 只有 local / remote 两个内置适配器键
    const unknownAdapter: RxDBPluginDependency = 'adapter:cache';

    expect(unknownAdapter).toBe('adapter:cache');
  });
});

describe('IRxDBPlugin.inject 成员形状契约', () => {
  it('inject 是可选的只读依赖数组', () => {
    expectTypeOf<IRxDBPlugin['inject']>().toEqualTypeOf<readonly RxDBPluginDependency[] | undefined>();

    // 不声明 inject 的插件照样 implements（AC#1：不声明 = 无依赖 = 立即安装）
    expectTypeOf<NoInjectPlugin>().toExtend<IRxDBPlugin>();
    // `as const` 推出的只读元组可赋值——插件作者的惯用写法不该被迫加类型标注
    expectTypeOf<InjectingPlugin>().toExtend<IRxDBPlugin>();

    expect(new InjectingPlugin().inject).toEqual(['adapter:local']);
  });

  it('inject 声明的元素受 RxDBPluginDependency 约束', () => {
    class BadInjectPlugin implements IRxDBPlugin {
      // @ts-expect-error 元素类型不在封闭取值内；inject 放宽成 string[] 时本行抑制会变成多余的
      readonly inject = ['adapter:localhost'] as const;
      readonly name = 'badInjectPlugin' as const;

      install(): void {
        // 类型层用例，无需实现
      }
    }

    expect(new BadInjectPlugin().inject).toEqual(['adapter:localhost']);
  });
});

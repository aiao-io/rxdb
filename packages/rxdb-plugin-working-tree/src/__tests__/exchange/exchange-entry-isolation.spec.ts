/**
 * @fileoverview US-316 补充交付：只导入 `@aiao/rxdb-plugin-working-tree/exchange`，加载到的本包模块恰好是那四个纯模块——
 * 没有实体类，没有插件类，没有捕获运行时。
 *
 * @remarks
 * **「全新的模块环境」就是这个文件本身。** 浏览器模式下每个 spec 文件一个 iframe、一张空的模块表；`vi.resetModules()` 在这里
 * 帮不上忙——原生 ESM 的模块表清不掉，同一个模块第二次 `import()` 既不重新请求也不重新求值（2026-11-18 在本包实测：
 * 带计数器的模块 reset 之后再 import，计数仍是 1，也没有新请求）。所以本文件除了 `vitest` **不静态导入任何东西**：
 * 多导入一个本包模块，它就在观测开始之前进了模块表，下面的断言再也看不见它。
 *
 * **观测靠 Resource Timing。** 每个 ES 模块都是向 vite 开发服务器的一次请求；开发服务器的 `root` 是包目录，于是本包的源码模块
 * 落在 `/src/` 下，别的包（`@aiao/rxdb` 的 dist）与预构建依赖走 `/@fs/`。清空计时缓冲、`import()`、再读一遍，读到的就是这一次
 * import 新加载的全部模块。
 *
 * **为什么不按「捕获钩子装没装上」「实体类登没登记」去判。** 钩子装在适配器实例上（`installWorkingTreeCapture(rxdb, adapter)`），
 * import 的那一刻还没有适配器；`@Entity` 只把元数据挂在类本身上，没有全局登记簿可查——两条断言对主入口同样成立，什么都分辨不出来。
 * 分辨得出的是**能做这两件事的模块根本没有加载**：装饰器在模块求值时执行，没加载就没有执行；装钩子的
 * `capture-install.ts` 与它装的 `capture-hook.ts` 不在模块表里，就没有任何代码能把钩子装上去。
 *
 * 第二条用例拿同一把尺子量主入口：量得出实体类、插件类与捕获运行时，说明第一条的「一个都没有」不是尺子坏了。
 * 两条的**先后有意义**：第二条加载过的模块不会再被请求，它必须排在后面。
 */

import { expect, it } from 'vitest';

/**
 * 本包源码模块的请求地址：取 `src/` 之后、查询串之前的那一段。
 *
 * @remarks
 * 开发服务器按 root 相对路径（`/src/…`）给出本包模块；同一个文件经别的路由（文件系统绝对路径、`/@fs/`）被请求时，路径里带着
 * `packages/rxdb-plugin-working-tree/src/`——两种都认，少认一种，从那条路进来的模块在第一条用例里就成了看不见的漏网之鱼。
 */
const OWN_MODULE = /(?:^https?:\/\/[^/]+|\/packages\/rxdb-plugin-working-tree)\/src\/([^?#]+)/;

/** 跑一次 `load`，交出它新加载的本包模块（相对 `src/`，排好序）。 */
const ownModulesLoadedBy = async (load: () => Promise<unknown>): Promise<string[]> => {
  // 缓冲默认只有 250 条，满了之后的请求不进缓冲：先清空再放大，保证这一次 import 的每个模块都留得下
  performance.clearResourceTimings();
  performance.setResourceTimingBufferSize(10_000);
  await load();
  return performance
    .getEntriesByType('resource')
    .map(entry => OWN_MODULE.exec(entry.name)?.[1])
    .filter((path): path is string => path !== undefined)
    .sort();
};

it('只导入 ./exchange：加载的本包模块恰好是入口与三个纯模块，实体类、插件类与捕获运行时一个都没有', async () => {
  const loaded = await ownModulesLoadedBy(() => import('../../exchange.js'));

  expect(loaded).toEqual([
    'commit/change-unit.ts',
    'commit/commit-exchange-json.ts',
    'exchange.ts',
    'working-tree/import-batch.ts'
  ]);
});

it('同一把尺子量主入口：量得出实体类、插件类与捕获运行时', async () => {
  const loaded = await ownModulesLoadedBy(() => import('../../index.js'));

  expect(loaded).toEqual(
    expect.arrayContaining([
      'plugin.ts',
      'commit/commit.entity.ts',
      'commit/commit-change-set.entity.ts',
      'working-tree/working-tree-entry.entity.ts',
      'working-tree/capture-install.ts',
      'working-tree/capture-hook.ts'
    ])
  );
  // 冷导入整个主入口（实体类、捕获运行时连同它们的依赖）就是这条用例的被测对象，没法预热；
  // 全量并行跑时单这一步就超过默认的 5 秒，时限按冷导入给。
}, 30_000);

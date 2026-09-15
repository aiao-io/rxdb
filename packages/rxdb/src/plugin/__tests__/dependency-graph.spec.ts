/**
 * 插件依赖图的纯函数层（US-015 阶段 B：AC#14 歧义裁决、AC#16 环检测、AC#13 拓扑序）。
 *
 * 为什么单独测这一层：环检测与歧义裁决发生在**安装规划阶段**——`reconcile()` 之前、
 * 任何 `install()` 之前。经 `RxDB` 测只能看到「抛了」，看不到「抛的时候图算到哪一步」；
 * 而「无 `plugin:*` 声明时拓扑序必须逐项等于插入序」这条 US-014 回归底线，
 * 更是只有把排序函数单独摆出来才钉得住。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBPluginAmbiguousDependencyError, RxDBPluginDependencyCycleError } from '../../RxDBError.js';
import type { IRxDBPlugin, RxDBPluginDependency } from '../../rxdb-plugin.js';
import {
  assertPluginDependencyGraph,
  resolveUniqueProvider,
  topologicalPluginOrder,
  type PluginNameIndex
} from '../dependency-graph.js';

class GraphTestPlugin implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name: Uncapitalize<string>;
  readonly inject?: readonly RxDBPluginDependency[];

  constructor(name: Uncapitalize<string>, inject?: readonly RxDBPluginDependency[]) {
    this.name = name;
    this.inject = inject;
  }

  install(): void {
    // 图层不关心安装体
  }
}

/** 另一个构造来源，专供「同名不同类」的歧义用例 —— 候选靠 `constructor.name` 区分 */
class RivalTestPlugin extends GraphTestPlugin {}

/** 按插件的 `name` 建索引，语义与宿主 `#plugin_by_name` 一致（同名保留全部候选） */
function indexOf(...plugins: readonly IRxDBPlugin[]): PluginNameIndex {
  const index = new Map<string, IRxDBPlugin[]>();
  for (const plugin of plugins) {
    const bucket = index.get(plugin.name);
    if (bucket === undefined) index.set(plugin.name, [plugin]);
    else bucket.push(plugin);
  }
  return index;
}

describe('resolveUniqueProvider —— 名字 → 唯一提供方', () => {
  it('没有同名插件时返回 undefined（AC#15 的缺失由调度器处理，不在这里抛）', () => {
    expect(resolveUniqueProvider(indexOf(new GraphTestPlugin('search')), 'plugin:nonexistent')).toBeUndefined();
  });

  it('恰好一个候选时返回该实例本身（纪元身份是引用，不是名字）', () => {
    const search = new GraphTestPlugin('search');

    expect(resolveUniqueProvider(indexOf(search), 'plugin:search')).toBe(search);
  });

  it('两个同名候选时抛歧义错误，并列出全部候选（AC#14）', () => {
    const index = indexOf(new GraphTestPlugin('search'), new RivalTestPlugin('search'));

    expect(() => resolveUniqueProvider(index, 'plugin:search')).toThrow(RxDBPluginAmbiguousDependencyError);
    try {
      resolveUniqueProvider(index, 'plugin:search');
    } catch (error) {
      // 只说「有歧义」而不说「歧义在谁和谁之间」，等于把定位工作原样退回给调用方
      expect((error as Error).message).toContain('GraphTestPlugin');
      expect((error as Error).message).toContain('RivalTestPlugin');
      expect((error as Error).message).toContain('plugin:search');
    }
  });
});

describe('assertPluginDependencyGraph —— 安装规划阶段的两道闸', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('重名但没有任何插件 inject 该名字 —— 不抛（D4：重名本身只由宿主 warn）', () => {
    const plugins = [new GraphTestPlugin('search'), new RivalTestPlugin('search')];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).not.toThrow();
  });

  it('重名且该名字被 inject —— 抛歧义错误（AC#14）', () => {
    const plugins = [
      new GraphTestPlugin('search'),
      new RivalTestPlugin('search'),
      new GraphTestPlugin('consumer', ['plugin:search'])
    ];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).toThrow(RxDBPluginAmbiguousDependencyError);
  });

  it('依赖不存在的插件 —— 不抛（AC#15 走等待 + 一次 warn，不是规划期错误）', () => {
    const plugins = [new GraphTestPlugin('lonely', ['plugin:nonexistent'])];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).not.toThrow();
  });

  it('只声明 adapter:* 的插件不构成图上的边', () => {
    const plugins = [new GraphTestPlugin('search', ['adapter:local', 'adapter:remote'])];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).not.toThrow();
  });

  it('DAG（菱形依赖）不抛', () => {
    const plugins = [
      new GraphTestPlugin('base'),
      new GraphTestPlugin('left', ['plugin:base']),
      new GraphTestPlugin('right', ['plugin:base']),
      new GraphTestPlugin('top', ['plugin:left', 'plugin:right'])
    ];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).not.toThrow();
  });

  it('二元环 a ↔ b —— 抛环检测错误，信息给出完整环路径（AC#16）', () => {
    const plugins = [new GraphTestPlugin('a', ['plugin:b']), new GraphTestPlugin('b', ['plugin:a'])];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).toThrow(RxDBPluginDependencyCycleError);
    try {
      assertPluginDependencyGraph(plugins, indexOf(...plugins));
    } catch (error) {
      // 只报「有环」而不报环路径，等于让人在 N 个插件里手工重建这张图
      expect((error as Error).message).toContain('a → b → a');
    }
  });

  it('自环 a → a 也是环', () => {
    const plugins = [new GraphTestPlugin('a', ['plugin:a'])];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).toThrow(/a → a/);
  });

  it('三元环 a → b → c → a 的路径完整', () => {
    const plugins = [
      new GraphTestPlugin('a', ['plugin:b']),
      new GraphTestPlugin('b', ['plugin:c']),
      new GraphTestPlugin('c', ['plugin:a'])
    ];

    expect(() => assertPluginDependencyGraph(plugins, indexOf(...plugins))).toThrow(/a → b → c → a/);
  });
});

describe('topologicalPluginOrder —— 提供方在前，同层保持插入序', () => {
  it('无 plugin:* 声明时逐项等于插入序（US-014 逆插入序的回归底线）', () => {
    const plugins = [
      new GraphTestPlugin('first'),
      new GraphTestPlugin('second', ['adapter:local']),
      new GraphTestPlugin('third')
    ];

    expect(topologicalPluginOrder(plugins, indexOf(...plugins))).toEqual(plugins);
  });

  it('依赖方后注册时顺序不变，但语义已是「提供方在前」', () => {
    const search = new GraphTestPlugin('search');
    const consumer = new GraphTestPlugin('consumer', ['plugin:search']);

    expect(topologicalPluginOrder([search, consumer], indexOf(search, consumer))).toEqual([search, consumer]);
  });

  it('依赖方先注册时被排到提供方之后（这正是逆插入序不够用的地方）', () => {
    const consumer = new GraphTestPlugin('consumer', ['plugin:search']);
    const search = new GraphTestPlugin('search');

    expect(topologicalPluginOrder([consumer, search], indexOf(consumer, search))).toEqual([search, consumer]);
  });

  it('互不相关的插件之间不因排序而换位', () => {
    const alone = new GraphTestPlugin('alone');
    const consumer = new GraphTestPlugin('consumer', ['plugin:search']);
    const search = new GraphTestPlugin('search');

    expect(topologicalPluginOrder([alone, consumer, search], indexOf(alone, consumer, search))).toEqual([
      alone,
      search,
      consumer
    ]);
  });

  it('依赖缺失时该插件照常在序列里（缺失不等于出局，等待态仍要参与拆卸）', () => {
    const lonely = new GraphTestPlugin('lonely', ['plugin:nonexistent']);

    expect(topologicalPluginOrder([lonely], indexOf(lonely))).toEqual([lonely]);
  });

  it('三级链 a → b → c 的拓扑序为 c、b、a（逆序即拆卸序）', () => {
    const a = new GraphTestPlugin('a', ['plugin:b']);
    const b = new GraphTestPlugin('b', ['plugin:c']);
    const c = new GraphTestPlugin('c');

    expect(topologicalPluginOrder([a, b, c], indexOf(a, b, c))).toEqual([c, b, a]);
  });
});

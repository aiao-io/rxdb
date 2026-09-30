/**
 * @fileoverview 捕获挂载点注册表（adapter-contract.md §1）——**清单归核心**之后的判据。
 *
 * @remarks
 * 这份判据原先长在 `@aiao/rxdb-plugin-working-tree` 里，靠 `?raw` 跨包读核心源码做漂移比对
 * （那条 import 上挂着一行 `eslint-disable @nx/enforce-module-boundaries`）。清单本身也在那边
 * 手抄了一份形参名——**核心的写原语清单于是有第三份编码**，而漂移只会在那一包的测试里响。
 *
 * 清单搬进核心之后，本文件盯的是三件事，前两件是原判据，第三件是搬迁本身买到的：
 *
 * 1. **注册表与真实源码逐字对得上**。形参名漂移（有人把 `disableTriggers` 改名成 `silent`）
 *    是静默的：判别对本地重载开始返回 false，捕获整条路径消失，没有任何报错。
 * 2. **`mergeChanges` 的两个重载语义相反**，判别式因此是形参名序列而不是函数名。本地重载写
 *    本地业务投影（必须捕获），远端重载推送到远端（捕获它会把一次 push 记成一批未提交变更）。
 * 3. **注册表就是安装层真正包住的那一组**。清单不再是一份没人调用的自述——
 *    {@link installWorkingTreeCapture} 与 `uninstall` 遍历的名字直接来自它，所以
 *    「注册表少一行」与「有个写原语没被包」是同一件事，装卸的往返在本文件里实测。
 *
 * 另有一条编译期判据不在本文件而在类型里：注册表按 `keyof RawWritePrimitives` 键控，
 * 核心新增第六个写原语却不登记挂载点**编译不过**。那一条测试断不出来（它先于测试红）。
 */

import { EMPTY, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  WORKING_TREE_CAPTURE_MOUNT_POINTS,
  installWorkingTreeCapture,
  isWorkingTreeCaptureMountPoint,
  uninstallWorkingTreeCapture,
  type MergeChangesNext,
  type RawWritePrimitives,
  type WorkingTreeCaptureHook,
  type WorkingTreeCaptureMountPoint,
  type WorkingTreeCaptureMountTarget
} from '../../capture/index.js';
// 比对的是**真实源码文本**而不是「我记得它长这样」：`?raw` 在构建期把文件内容内联成字符串。
// 同包相对路径——清单归核心之后，这条 import 不再越过任何包边界。
import ADAPTER_SOURCE from '../../rxdb-adapter.ts?raw';

/** 真实源码里一条抽象方法声明的形状。 */
interface DeclaredMethod {
  readonly host: string;
  readonly method: string;
  readonly parameters: readonly string[];
}

/** 按顶层逗号切分形参表，忽略泛型 / 对象 / 数组 / 括号内部的逗号。 */
function splitTopLevel(parameterList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of parameterList) {
    if ('<([{'.includes(char)) depth += 1;
    if ('>)]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(part => part.length > 0);
}

/** 从 `rxdb-adapter.ts` 里读出全部 `abstract` 方法声明（含重载），按声明顺序返回。 */
function readDeclaredMethods(source: string): DeclaredMethod[] {
  const classPattern = /export abstract class (\w+)/g;
  const bounds: { host: string; start: number }[] = [];
  for (const match of source.matchAll(classPattern)) {
    bounds.push({ host: match[1], start: match.index ?? 0 });
  }
  const declared: DeclaredMethod[] = [];
  for (const [index, bound] of bounds.entries()) {
    const end = bounds[index + 1]?.start ?? source.length;
    const body = source.slice(bound.start, end);
    const methodPattern = /\babstract\s+(\w+)\s*(?:<[^>]*>)?\s*\(([\s\S]*?)\)\s*:/g;
    for (const match of body.matchAll(methodPattern)) {
      const parameters = splitTopLevel(match[2]).map(part => part.split(/[?:]/)[0].trim());
      declared.push({ host: bound.host, method: match[1], parameters });
    }
  }
  return declared;
}

const DECLARED_METHODS = readDeclaredMethods(ADAPTER_SOURCE);

function findDeclarations(host: string, method: string): DeclaredMethod[] {
  return DECLARED_METHODS.filter(entry => entry.host === host && entry.method === method);
}

function mountPointsByOrdinal(ordinal: number): WorkingTreeCaptureMountPoint[] {
  return WORKING_TREE_CAPTURE_MOUNT_POINTS.filter(point => point.ordinal === ordinal);
}

describe('捕获挂载点注册表的形状', () => {
  it('恰好覆盖契约 §1 的 4 个序号，一个不多一个不少', () => {
    const ordinals = [...new Set(WORKING_TREE_CAPTURE_MOUNT_POINTS.map(point => point.ordinal))].sort();
    expect(ordinals).toEqual([1, 2, 3, 4]);
  });

  it('宿主只能是适配器写原语所在的本地基类，捕获不挂 Repository 层', () => {
    const hosts = [...new Set(WORKING_TREE_CAPTURE_MOUNT_POINTS.map(point => point.host))];
    expect(hosts).toEqual(['RxDBAdapterLocalBase']);
  });

  it('每条挂载点都写明了为什么必须挂——注册表本身要能当文档读', () => {
    for (const point of WORKING_TREE_CAPTURE_MOUNT_POINTS) {
      expect(point.why.length, `${point.method} 缺少挂载理由`).toBeGreaterThan(0);
    }
  });
});

describe('挂载点 1：transaction —— 原子边界', () => {
  const points = mountPointsByOrdinal(1);

  it('登记的是 transaction，形参为 (fun, transactionLog)', () => {
    expect(points.map(point => point.method)).toEqual(['transaction']);
    expect(points[0].parameters).toEqual(['fun', 'transactionLog']);
  });

  it('真实源码里的两个重载形参名与登记逐字一致', () => {
    const declarations = findDeclarations('RxDBAdapterLocalBase', 'transaction');
    expect(declarations.length).toBe(2);
    for (const declaration of declarations) {
      expect(declaration.parameters).toEqual(points[0].parameters);
    }
  });
});

describe('挂载点 2：本地 mergeChanges —— restore / merge / 同步的实体应用', () => {
  const points = mountPointsByOrdinal(2);

  it('登记的形参是本地重载的 (actions, localChanges, disableTriggers)', () => {
    expect(points.map(point => point.method)).toEqual(['mergeChanges']);
    expect(points[0].parameters).toEqual(['actions', 'localChanges', 'disableTriggers']);
  });

  it('真实源码里本地重载的形参名与登记逐字一致', () => {
    const declarations = findDeclarations('RxDBAdapterLocalBase', 'mergeChanges');
    expect(declarations.length).toBe(1);
    expect(declarations[0].parameters).toEqual(points[0].parameters);
  });
});

describe('挂载点 3：switchBranch —— 分支物化、redo 失效、undo/redo 应用', () => {
  const points = mountPointsByOrdinal(3);

  it('登记的是 switchBranch，形参为 (options)', () => {
    expect(points.map(point => point.method)).toEqual(['switchBranch']);
    expect(points[0].parameters).toEqual(['options']);
  });

  it('真实源码里的声明与登记逐字一致', () => {
    const declarations = findDeclarations('RxDBAdapterLocalBase', 'switchBranch');
    expect(declarations.length).toBe(1);
    expect(declarations[0].parameters).toEqual(points[0].parameters);
  });
});

describe('挂载点 4：upsertMany / deleteByIds —— 不经 rawQuery 的敞口', () => {
  const points = mountPointsByOrdinal(4);

  it('两个方法各占一行，缺任何一个都留下敞口', () => {
    expect(points.map(point => point.method).sort()).toEqual(['deleteByIds', 'upsertMany']);
  });

  it('真实源码里两者的形参名与登记逐字一致', () => {
    for (const point of points) {
      const declarations = findDeclarations('RxDBAdapterLocalBase', point.method);
      expect(declarations.length, `${point.method} 应恰好声明一次`).toBe(1);
      expect(declarations[0].parameters).toEqual(point.parameters);
    }
  });
});

describe('远端 mergeChanges 重载不在表内，且判别按签名不按函数名', () => {
  it('远端重载确实存在于源码，只是宿主与形参都不同', () => {
    const declarations = findDeclarations('RxDBAdapterRemoteBase', 'mergeChanges');
    expect(declarations.length).toBe(1);
    expect(declarations[0].parameters).toEqual(['actions', 'branchId', 'changes']);
  });

  it('注册表里没有任何一条指向远端基类', () => {
    expect(WORKING_TREE_CAPTURE_MOUNT_POINTS.some(point => point.host === 'RxDBAdapterRemoteBase')).toBe(false);
  });

  it('同名、不同参 ⇒ 本地为真、远端为假（按函数名判别的实现过不了这一条）', () => {
    expect(
      isWorkingTreeCaptureMountPoint({
        host: 'RxDBAdapterLocalBase',
        method: 'mergeChanges',
        parameters: ['actions', 'localChanges', 'disableTriggers']
      })
    ).toBe(true);
    expect(
      isWorkingTreeCaptureMountPoint({
        host: 'RxDBAdapterRemoteBase',
        method: 'mergeChanges',
        parameters: ['actions', 'branchId', 'changes']
      })
    ).toBe(false);
  });

  it('形参名漂移即判为不是挂载点，不做模糊匹配', () => {
    expect(
      isWorkingTreeCaptureMountPoint({
        host: 'RxDBAdapterLocalBase',
        method: 'mergeChanges',
        parameters: ['actions', 'localChanges', 'silent']
      })
    ).toBe(false);
  });
});

describe('rawQuery 不属于捕获表', () => {
  it('它走 4 步 bypass 判定（拒绝），不是捕获挂载点', () => {
    // `point.method` 的类型已是 `keyof RawWritePrimitives`，把 `'rawQuery'` 写进注册表**编译不过**；
    // 这条运行时断言仍留着，是为了在那个键控被放宽的那天，先在这里红一次而不是悄悄多一行。
    const methods: readonly string[] = WORKING_TREE_CAPTURE_MOUNT_POINTS.map(point => point.method);
    expect(methods).not.toContain('rawQuery');
    expect(
      isWorkingTreeCaptureMountPoint({
        host: 'RxDBAdapterLocalBase',
        method: 'rawQuery',
        parameters: ['sql', 'params']
      })
    ).toBe(false);
  });

  it('它在接口上是可选方法——没实现它的适配器不因此少一个捕获挂载点', () => {
    expect(ADAPTER_SOURCE).toMatch(/rawQuery\?\(sql: string, params\?: unknown\[\]\)/);
    expect(mountPointsByOrdinal(4).length).toBe(2);
  });
});

/**
 * 只转交、不做任何捕获的运行时替身。
 *
 * @remarks
 * 本文件不验捕获语义（那在插件那侧），只验**哪些方法被包住了**，所以每个转交口原样调 `next`。
 */
function createPassthroughHook(): WorkingTreeCaptureHook {
  return {
    bindMountTarget: () => undefined,
    interceptTransaction: (host, next, fun, transactionLog) => next(fun, transactionLog),
    interceptMergeChanges: (host, next: MergeChangesNext, actions, localChanges, disableTriggers) =>
      next(host, actions, localChanges, disableTriggers),
    interceptSwitchBranch: (host, next, options) => next(options),
    interceptBulkWrite: (host, next) => next(),
    gateRawWrite: (sql, execute) => Promise.resolve(execute()),
    gateExternalNotify: (entityName, namespace, notify) => notify()
  };
}

/** 方法全在原型上的适配器替身：装卸前后的**自有属性**因此就是「被包了哪几个」。 */
class StubMountTarget implements WorkingTreeCaptureMountTarget {
  async transaction(): Promise<unknown> {
    return undefined;
  }

  async mergeChanges(): Promise<number | void> {
    return 0;
  }

  async switchBranch(): Promise<void> {
    return undefined;
  }

  upsertMany(): Observable<void> {
    return EMPTY;
  }

  deleteByIds(): Observable<void> {
    return EMPTY;
  }

  runInTransaction(): never {
    throw new Error('替身不会走到事务');
  }
}

describe('注册表与安装层是同一份清单', () => {
  it('装上之后，被改写的自有方法恰好是注册表登记的那一组', () => {
    const target = new StubMountTarget();
    expect(Object.getOwnPropertyNames(target)).toEqual([]);

    installWorkingTreeCapture(target, createPassthroughHook());

    // 注册表里 `ordinal` 4 占两行，方法名却互不重复——被包的一组按定义就是登记的一组。
    expect(Object.getOwnPropertyNames(target).sort()).toEqual(
      [...new Set(WORKING_TREE_CAPTURE_MOUNT_POINTS.map(point => point.method))].sort()
    );
  });

  it('卸载把它们一并还原——注册表漏一行，那一行就会在这里留下一个包装', () => {
    const target = new StubMountTarget();
    installWorkingTreeCapture(target, createPassthroughHook());
    uninstallWorkingTreeCapture(target);

    expect(Object.getOwnPropertyNames(target)).toEqual([]);
  });

  it('交回的未拦截原语与注册表同名同数', () => {
    const target = new StubMountTarget();
    const raw: RawWritePrimitives = installWorkingTreeCapture(target, createPassthroughHook());

    expect(Object.keys(raw).sort()).toEqual(
      [...new Set(WORKING_TREE_CAPTURE_MOUNT_POINTS.map(point => point.method))].sort()
    );
  });
});

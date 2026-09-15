/**
 * @fileoverview T046 红测试：捕获挂载点注册表（adapter-contract.md §1）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/capture-mount-points.ts`——**一份声明式注册表**，而不是散落在
 * 四处的 `// 这里挂了捕获` 注释。T058–T061 各自去那四个写原语上真正挂钩子，本文件只钉一件事：
 * **哪些写原语必须被挂、哪些必须不被挂**，并且这个答案要能被机器复核。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **「挂在 Repository 层」是最自然的错误做法**。Repository 是业务代码唯一直接调用的东西，
 *    在那里挂捕获看起来覆盖了全部 CRUD。它漏掉的是同步、撤销、分支物化——那些路径根本不经
 *    Repository，而它们恰恰是工作树里 `origin != 'local'` 的全部来源。所以注册表把宿主限定在
 *    `rxdb-adapter.ts` 的写原语上，并让测试去真实源码里核对，而不是信任注册表的自述。
 * 2. **`mergeChanges` 有两个重载，同名但语义相反**。本地重载 `(actions, localChanges?,
 *    disableTriggers?)` 写本地业务投影，必须捕获；远端重载 `(actions, branchId?, changes?)`
 *    推送到远端，捕获它会把一次 push 记成一批未提交变更——用户提交一次，工作树反而变脏。
 *    按**函数名**判别的实现两个都会挂上，而且测试如果也按函数名断言，就会跟着一起错。
 *    所以判别式是**形参名序列**，并且专门有一组用例要求「同名、不同参 ⇒ 一真一假」。
 * 3. **形参名会漂移，而漂移是静默的**。有人把 `disableTriggers` 改名成 `silent`，注册表还认得
 *    旧名字，于是判别对本地重载返回 false——捕获整条路径消失，没有任何报错。所以每个挂载点都
 *    去真实源码里逐字比对形参名，而不是只比对方法名存在与否。
 * 4. **`upsertMany` / `deleteByIds` 是最容易被漏掉的一组**：它们不经 `rawQuery`，也不经
 *    `transaction`，5 步 bypass 判定拦不到它们（那份判定只挂在 raw 写路径上）。契约 §1 第 4 行
 *    存在的唯一理由就是堵这个敞口，所以注册表必须把它们**显式**列进来。
 * 5. **`rawQuery` 看起来最该被列进来，但它不属于这张表**。它走的是 §2 的 5 步判定——拒绝，而不是
 *    捕获；而且它在 `rxdb-adapter.ts:94` 上是**可选方法**，没实现它的适配器不因此获得豁免。把它
 *    混进捕获表会让「没有 rawQuery 的适配器没有敞口」这个错误结论看起来成立。
 */

import { describe, expect, it } from 'vitest';
// 本包的测试跑在 chromium 里，没有 node:fs。要拿到 `rxdb-adapter.ts` 的**源码文本**做漂移比对，
// 唯一的办法是 Vite 的 `?raw`——它在构建期把文件内容内联成字符串，因此比对的是真实源码，
// 而不是「我记得它长这样」。
// eslint-disable-next-line @nx/enforce-module-boundaries -- 越过包边界读的正是被比对的那份核心源码本身
import ADAPTER_SOURCE from '../../../../rxdb/src/rxdb-adapter.ts?raw';
import {
  CAPTURE_MOUNT_POINTS,
  isCaptureMountPoint,
  type CaptureMountPoint
} from '../../working-tree/capture-mount-points.js';

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

function mountPointsByOrdinal(ordinal: number): CaptureMountPoint[] {
  return CAPTURE_MOUNT_POINTS.filter(point => point.ordinal === ordinal);
}

describe('捕获挂载点注册表的形状', () => {
  it('恰好覆盖契约 §1 的 4 个序号，一个不多一个不少', () => {
    const ordinals = [...new Set(CAPTURE_MOUNT_POINTS.map(point => point.ordinal))].sort();
    expect(ordinals).toEqual([1, 2, 3, 4]);
  });

  it('宿主只能是适配器写原语所在的本地基类，捕获不挂 Repository 层', () => {
    const hosts = [...new Set(CAPTURE_MOUNT_POINTS.map(point => point.host))];
    expect(hosts).toEqual(['RxDBAdapterLocalBase']);
  });

  it('每条挂载点都写明了为什么必须挂——注册表本身要能当文档读', () => {
    for (const point of CAPTURE_MOUNT_POINTS) {
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
    expect(CAPTURE_MOUNT_POINTS.some(point => point.host === 'RxDBAdapterRemoteBase')).toBe(false);
  });

  it('同名、不同参 ⇒ 本地为真、远端为假（按函数名判别的实现过不了这一条）', () => {
    expect(
      isCaptureMountPoint({
        host: 'RxDBAdapterLocalBase',
        method: 'mergeChanges',
        parameters: ['actions', 'localChanges', 'disableTriggers']
      })
    ).toBe(true);
    expect(
      isCaptureMountPoint({
        host: 'RxDBAdapterRemoteBase',
        method: 'mergeChanges',
        parameters: ['actions', 'branchId', 'changes']
      })
    ).toBe(false);
  });

  it('形参名漂移即判为不是挂载点，不做模糊匹配', () => {
    expect(
      isCaptureMountPoint({
        host: 'RxDBAdapterLocalBase',
        method: 'mergeChanges',
        parameters: ['actions', 'localChanges', 'silent']
      })
    ).toBe(false);
  });
});

describe('rawQuery 不属于捕获表', () => {
  it('它走 5 步 bypass 判定（拒绝），不是捕获挂载点', () => {
    expect(CAPTURE_MOUNT_POINTS.some(point => point.method === 'rawQuery')).toBe(false);
    expect(
      isCaptureMountPoint({ host: 'RxDBAdapterLocalBase', method: 'rawQuery', parameters: ['sql', 'params'] })
    ).toBe(false);
  });

  it('它在接口上是可选方法——没实现它的适配器不因此少一个捕获挂载点', () => {
    expect(ADAPTER_SOURCE).toMatch(/rawQuery\?\(sql: string, params\?: unknown\[\]\)/);
    expect(mountPointsByOrdinal(4).length).toBe(2);
  });
});

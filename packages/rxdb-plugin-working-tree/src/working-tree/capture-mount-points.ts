/**
 * @fileoverview 捕获挂载点注册表（contracts/adapter-contract.md §1）。
 *
 * @remarks
 * 捕获必须挂在**适配器写原语**上。挂在 Repository 层是最自然的错误做法——它是业务代码唯一直接
 * 调用的东西，看起来覆盖了全部 CRUD；漏掉的是同步、撤销、分支物化，而那几条路径根本不经
 * Repository，却恰恰是工作树里 `origin != 'local'` 的全部来源。
 *
 * 这里是**声明式注册表**，不是散在四处的「// 这里挂了捕获」注释：T058–T061 各自去写原语上真正挂
 * 钩子，本模块回答的是「哪些原语必须被挂、哪些必须不被挂」，而且这个答案能被机器复核——
 * `__tests__/working-tree/capture-mount-points.spec.ts` 用 `?raw` 读真实源码，逐字比对形参名。
 *
 * 判别式是**形参名序列**而不是函数名，因为 `mergeChanges` 有两个语义相反的重载。
 */

/**
 * 一个写原语的签名身份
 *
 * @remarks
 * 形参**名序列**参与身份，是为了让判别对重载有效：`mergeChanges` 在本地与远端基类上同名，
 * 一个写本地业务投影（必须捕获），一个推送到远端（捕获它会把一次 push 记成一批未提交变更，
 * 用户提交一次、工作树反而变脏）。按函数名判别的实现两个都会挂上。
 *
 * 形参名漂移（有人把 `disableTriggers` 改名成 `silent`）因此**判为不是挂载点**，不做模糊匹配：
 * 模糊匹配会让捕获在改名后继续「成立」，而挂钩子的那一处其实已经失配了。
 */
export interface WritePrimitiveSignature {
  /** 声明该方法的抽象基类名 */
  readonly host: string;

  /** 方法名 */
  readonly method: string;

  /** 形参名，按声明顺序；可选标记与类型不参与 */
  readonly parameters: readonly string[];
}

/** 契约 §1 表格里的行号，1–4。 */
export type CaptureMountPointOrdinal = 1 | 2 | 3 | 4;

/** 一条必须挂载工作树捕获的写原语。 */
export interface CaptureMountPoint extends WritePrimitiveSignature {
  /** 对应契约 §1 表格的第几行 */
  readonly ordinal: CaptureMountPointOrdinal;

  /** 为什么必须挂——注册表本身要能当文档读 */
  readonly why: string;
}

/**
 * 契约 §1 的 4 个挂载点
 *
 * @remarks
 * `rawQuery` **不在**表内：它走 §2 的 5 步 bypass 判定——**拒绝**，不是捕获。而且它在适配器接口上
 * 是可选方法，把它混进来会让「没有 `rawQuery` 的适配器没有敞口」这个错误结论看起来成立；真正的
 * 敞口是第 4 行那两个方法。
 *
 * 序号 4 占两行：`upsertMany` 与 `deleteByIds` 各算一个挂载点，缺任何一个都留下敞口。
 */
export const CAPTURE_MOUNT_POINTS: readonly CaptureMountPoint[] = [
  {
    ordinal: 1,
    host: 'RxDBAdapterLocalBase',
    method: 'transaction',
    parameters: ['fun', 'transactionLog'],
    why: '普通 CRUD 与显式事务的共同入口，提供 FR-039 那四步所需的原子边界。'
  },
  {
    ordinal: 2,
    host: 'RxDBAdapterLocalBase',
    method: 'mergeChanges',
    parameters: ['actions', 'localChanges', 'disableTriggers'],
    why: 'restore / merge / 同步的实体应用都经这里；远端重载同名但语义相反，按形参序列区分。'
  },
  {
    ordinal: 3,
    host: 'RxDBAdapterLocalBase',
    method: 'switchBranch',
    parameters: ['options'],
    why: '分支物化、redo 失效标记、undo/redo 应用三条路径都改写业务投影，且都不经 Repository。'
  },
  {
    ordinal: 4,
    host: 'RxDBAdapterLocalBase',
    method: 'upsertMany',
    parameters: ['entityName', 'data'],
    why: '不经 rawQuery 也不经 transaction，5 步 bypass 判定够不到；不显式挂载就是一个敞口。'
  },
  {
    ordinal: 4,
    host: 'RxDBAdapterLocalBase',
    method: 'deleteByIds',
    parameters: ['entityName', 'ids'],
    why: '与 upsertMany 同一个敞口的删除侧；只堵住写入侧等于没堵。'
  }
];

/** 形参名序列逐字逐位相同。 */
function sameParameters(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

/**
 * 判定一个写原语签名是否为捕获挂载点
 *
 * @param signature - 待判定的写原语签名
 * @returns 命中 {@link CAPTURE_MOUNT_POINTS} 时为 `true`
 *
 * @remarks
 * 三项**全等**才算命中：宿主基类、方法名、形参名序列。少比对任何一项都会把远端 `mergeChanges`
 * 或改名后的本地重载判成挂载点。
 *
 * @example
 * ```ts
 * isCaptureMountPoint({
 *   host: 'RxDBAdapterLocalBase',
 *   method: 'mergeChanges',
 *   parameters: ['actions', 'localChanges', 'disableTriggers']
 * }); // true —— 本地重载
 * ```
 */
export function isCaptureMountPoint(signature: WritePrimitiveSignature): boolean {
  return CAPTURE_MOUNT_POINTS.some(
    point =>
      point.host === signature.host &&
      point.method === signature.method &&
      sameParameters(point.parameters, signature.parameters)
  );
}

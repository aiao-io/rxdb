/**
 * @fileoverview 捕获挂载点注册表（contracts/adapter-contract.md §1）——**清单的唯一定义处**。
 *
 * @remarks
 * 捕获必须挂在**适配器写原语**上。挂在 Repository 层是最自然的错误做法——它是业务代码唯一直接
 * 调用的东西，看起来覆盖了全部 CRUD；漏掉的是同步、撤销、分支物化，而那几条路径根本不经
 * Repository，却恰恰是工作树里 `origin != 'local'` 的全部来源。
 *
 * **这份清单为什么归核心**：它随**核心的写原语**变——多一个 `RxDBAdapterLocalBase` 写方法就多
 * 一个挂载点，而按 `capture/index.ts` 立的那条线，随核心写原语变的东西归核心。
 * `@aiao/rxdb-plugin-working-tree` 那侧的同名导出是本模块的**转发**，不是平行的第二份声明；
 * 早先它是各写一遍的形态，形参名在两处手抄，核心改名不会让任何一处编译红。
 *
 * **它不是一份没人调用的自述**：{@link WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS} 就是
 * `installWorkingTreeCapture()` / `uninstallWorkingTreeCapture()` 装卸时遍历的那组名字，
 * 于是「注册表少一行」与「有个写原语没被包住」在运行时是同一件事。
 *
 * 判别式是**形参名序列**而不是函数名，因为 `mergeChanges` 有两个语义相反的重载。
 */

import type { RawWritePrimitives } from './capture-interceptor.js';

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
 *
 * `method` 在这里是裸 `string`——待判定的签名来自源码文本，`rawQuery` 这类**不是**挂载点的
 * 方法名也要能被问。注册表那一侧窄成 {@link WorkingTreeCaptureMountPoint.method}。
 */
export interface WorkingTreeWritePrimitiveSignature {
  /** 声明该方法的抽象基类名 */
  readonly host: string;

  /** 方法名 */
  readonly method: string;

  /** 形参名，按声明顺序；可选标记与类型不参与 */
  readonly parameters: readonly string[];
}

/** 契约 §1 表格里的行号，1–4。 */
export type WorkingTreeCaptureMountPointOrdinal = 1 | 2 | 3 | 4;

/**
 * 一条必须挂载工作树捕获的写原语。
 *
 * @remarks
 * `method` 窄到 `keyof RawWritePrimitives`：登记一个不存在的原语、或原语改名后忘了改这里，
 * 都是**编译错误**而不是一条静默失配的规则。
 */
export interface WorkingTreeCaptureMountPoint extends WorkingTreeWritePrimitiveSignature {
  /** 对应契约 §1 表格的第几行 */
  readonly ordinal: WorkingTreeCaptureMountPointOrdinal;

  /** 这一行挂的是哪个写原语 */
  readonly method: keyof RawWritePrimitives;

  /** 为什么必须挂——注册表本身要能当文档读 */
  readonly why: string;
}

/** 一条挂载点里除方法名之外的部分；方法名是键。 */
type MountPointDetail = Omit<WorkingTreeCaptureMountPoint, 'method'>;

/**
 * 契约 §1 的 4 个挂载点，**按写原语键控**。
 *
 * @remarks
 * 键是 `keyof RawWritePrimitives` 且 `Record` 要求穷尽：核心新增第六个写原语却不在这里登记
 * 挂载点，**编译不过**。早先的数组形态下，加原语忘了登记没有任何东西会红——敞口静默出现，
 * 而这正是捕获最不能出现的一种失效。
 *
 * `rawQuery` **不在**表内：它走 §2 的 4 步 bypass 判定——**拒绝**，不是捕获。而且它在适配器接口上
 * 是可选方法，把它混进来会让「没有 `rawQuery` 的适配器没有敞口」这个错误结论看起来成立；真正的
 * 敞口是第 4 行那两个方法。
 *
 * 序号 4 占两行：`upsertMany` 与 `deleteByIds` 各算一个挂载点，缺任何一个都留下敞口。
 */
const MOUNT_POINTS_BY_PRIMITIVE: Readonly<Record<keyof RawWritePrimitives, MountPointDetail>> = {
  transaction: {
    ordinal: 1,
    host: 'RxDBAdapterLocalBase',
    parameters: ['fun', 'transactionLog'],
    why: '普通 CRUD 与显式事务的共同入口，提供 FR-039 那四步所需的原子边界。'
  },
  mergeChanges: {
    ordinal: 2,
    host: 'RxDBAdapterLocalBase',
    parameters: ['actions', 'localChanges', 'disableTriggers'],
    why: 'restore / merge / 同步的实体应用都经这里；远端重载同名但语义相反，按形参序列区分。'
  },
  switchBranch: {
    ordinal: 3,
    host: 'RxDBAdapterLocalBase',
    parameters: ['options'],
    why: '分支物化、redo 失效标记、undo/redo 应用三条路径都改写业务投影，且都不经 Repository。'
  },
  upsertMany: {
    ordinal: 4,
    host: 'RxDBAdapterLocalBase',
    parameters: ['entityName', 'data'],
    why: '不经 rawQuery 也不经 transaction，4 步 bypass 判定够不到；不显式挂载就是一个敞口。'
  },
  deleteByIds: {
    ordinal: 4,
    host: 'RxDBAdapterLocalBase',
    parameters: ['entityName', 'ids'],
    why: '与 upsertMany 同一个敞口的删除侧；只堵住写入侧等于没堵。'
  }
};

/**
 * 被挂载的写原语名，按契约 §1 的表格顺序。
 *
 * @remarks
 * `Object.keys()` 丢掉键的字面量类型，这里断言回去——键的穷尽性由
 * {@link MOUNT_POINTS_BY_PRIMITIVE} 的 `Record` 标注保证，本行只是把它读出来。
 *
 * 安装与卸载共用这一份：少一个名字就是一个永久敞口，而它现在与注册表同源。
 */
export const WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS: readonly (keyof RawWritePrimitives)[] = Object.keys(
  MOUNT_POINTS_BY_PRIMITIVE
) as (keyof RawWritePrimitives)[];

/** 契约 §1 的 4 个挂载点，展平成行。 */
export const WORKING_TREE_CAPTURE_MOUNT_POINTS: readonly WorkingTreeCaptureMountPoint[] =
  WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS.map(method => ({
    method,
    ...MOUNT_POINTS_BY_PRIMITIVE[method]
  }));

/** 形参名序列逐字逐位相同。 */
function sameParameters(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

/**
 * 判定一个写原语签名是否为捕获挂载点
 *
 * @param signature - 待判定的写原语签名
 * @returns 命中 {@link WORKING_TREE_CAPTURE_MOUNT_POINTS} 时为 `true`
 *
 * @remarks
 * 三项**全等**才算命中：宿主基类、方法名、形参名序列。少比对任何一项都会把远端 `mergeChanges`
 * 或改名后的本地重载判成挂载点。
 *
 * @example
 * ```ts
 * isWorkingTreeCaptureMountPoint({
 *   host: 'RxDBAdapterLocalBase',
 *   method: 'mergeChanges',
 *   parameters: ['actions', 'localChanges', 'disableTriggers']
 * }); // true —— 本地重载
 * ```
 */
export function isWorkingTreeCaptureMountPoint(signature: WorkingTreeWritePrimitiveSignature): boolean {
  return WORKING_TREE_CAPTURE_MOUNT_POINTS.some(
    point =>
      point.host === signature.host &&
      point.method === signature.method &&
      sameParameters(point.parameters, signature.parameters)
  );
}

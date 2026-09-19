/**
 * @fileoverview 写入口语义矩阵：一次写要不要落工作树单元（spec.md「写入口语义矩阵」、FR-046）。
 *
 * @remarks
 * 四个捕获挂载点与六个适配器的 `rawQuery` 调的都是这里的 {@link classifyWriteEntrance}。
 * 一份判定、多处调用——与 5 步 bypass 判定同一个理由：同一张表在十处各解释一遍，十处就会
 * 慢慢解释成十个样子。
 *
 * **判据是「入口 × 目标类 × 写了哪些列」，不是函数名。** 同一个 `mergeChanges` 在本地重载上
 * 落矩阵行 3、在远端重载上根本不写业务表；同一次 `save()` 写版本化实体落行 1、写 QueryCache
 * 实体落行 8。写成 `if (callerIsPull())` 的话，判据就成了「6 个适配器 × 4 个挂载点的调用图」，
 * 而那张图每次重构都在变。
 *
 * **三种结论，不是两种。** 「不捕获」与「拒绝」都没产生单元，很容易被实现成同一个 `return false`，
 * 但行 6（分支物化）与行 9（raw 直写）要的行为相反：前者必须让这次写**照常发生**，后者必须让它
 * **根本不发生**。合并成布尔之后两行里必有一行是错的，而且错的那行没有测试位置能发现。
 *
 * **untracked 字段域是注入的。** 判定连查表都不做，只做子集比较——「第二份清单」在类型上无处可放
 * （唯一那份见 `./versioned-domain.ts`）。
 */

import type { WriteEntrance } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import { CommitErrorCode } from '../commit/commit-error-codes.js';

/**
 * 一次写所针对的表类别
 *
 * @remarks
 * 三类穷尽了库里的表，且**只有 `versioned` 需要保护**：`query_cache` 的内容可从远端重建，
 * `system` 是库自己的簿记。判定因此可以在看入口之前先按目标类短路两类，剩下的分支全是
 * 「谁在写这张版本化业务表」。
 */
export const WRITE_TARGET_CLASSES = ['versioned', 'query_cache', 'system'] as const;

/** {@link WRITE_TARGET_CLASSES} 的值联合 */
export type WriteTargetClass = (typeof WRITE_TARGET_CLASSES)[number];

/** 一次写的操作种类；只有 `update` 可能构不成净变化。 */
export type WriteOperation = 'insert' | 'update' | 'delete';

/**
 * 这次写碰了哪些列
 *
 * @remarks
 * 三态而不是「一个可能为空的数组」：`whole_row`（整行替换）与 `columns: []`（一列都没写）
 * 语义相反，`unknown`（解析不出）与两者都不同。压成数组之后 `[]` 要同时表达三件事，
 * 而其中两件的正确结论相反。
 */
export type WriteColumns =
  /** 整行被替换：批量写原语与 upsert 的形态，**永远**不是 untracked 子集 */
  | {
      /** 判别位：整行替换 */
      readonly kind: 'whole_row';
    }
  /** 解析不出被写列：按「不是 untracked 子集」处理（fail-closed） */
  | {
      /** 判别位：被写列解析不出 */
      readonly kind: 'unknown';
    }
  /** 明确的被写列名集合；空数组即语义 no-op */
  | {
      /** 判别位：被写列已知 */
      readonly kind: 'columns';
      /** 被写的列名；空数组即语义 no-op，与 `whole_row` 的结论相反 */
      readonly names: readonly string[];
    };

/**
 * 交给 {@link classifyWriteEntrance} 的一次写
 *
 * @remarks
 * 入口身份与列集**缺一不可**：只有入口表达不了矩阵行 4，只有列集表达不了行 6 与行 9 的相反结论。
 */
export interface WriteEntranceRequest {
  /** 谁在写 */
  readonly entrance: WriteEntrance;

  /** 写的是哪一类表 */
  readonly targetClass: WriteTargetClass;

  /** 写的是哪一种操作 */
  readonly operation: WriteOperation;

  /** 这次写碰了哪些列 */
  readonly columns: WriteColumns;

  /**
   * 目标表上不构成业务净变化的列名
   *
   * @remarks
   * 由调用方从 `VersionedDomainView.untrackedFieldsOf()` 取来注入。判定自带一份就是在建
   * spec.md 明令禁止的第二份清单。
   */
  readonly untrackedFields: readonly string[];

  /** 这个数据库启用提交能力了吗 */
  readonly capabilityEnabled: boolean;
}

/**
 * 单元的来源
 *
 * @remarks
 * 与「要不要进 changelog」是两个问题，即使今天答案一一对应。FR-046 点名的失败形态是 pull
 * 写进来的实体被当成本地编辑再 push 回去（push echo）；两者合成一个字段之后，「`remote_sync`
 * 的单元要不要 push」就没有代码位置可改了。
 */
export type WriteEntryOrigin = 'local' | 'remote_sync';

/** 放行但不产生单元的理由；每一条对应矩阵里一组不同的行。 */
export type NoCaptureReason =
  /** 目标是 QueryCache 实体表：可从远端重建，不是用户编辑的结果 */
  | 'query_cache'
  /** 列集 ⊆ untracked 字段域的 UPDATE：回填簿记列不表达用户意图 */
  | 'no_net_change'
  /** 底层投影重写（行 6）：写必须照常发生，只是不被二次记录 */
  | 'domain_managed'
  /** 目标是系统表：库自己的簿记 */
  | 'system_target'
  /** 这个数据库没启用提交能力：行为必须与没装这个特性时逐字节一致 */
  | 'capability_disabled';

/** {@link classifyWriteEntrance} 的结论。 */
export type WriteEntranceDecision =
  | {
      /** 这次写要落成一个工作树单元 */
      readonly kind: 'capture';
      /** 单元的作者是本地用户还是同步机制 */
      readonly origin: WriteEntryOrigin;
      /** 恒为 `true`：落单元与递增 revision 同生同死 */
      readonly revisionBump: true;
      /** 这个单元推得回远端吗；`remote_sync` 的单元推回去就是 push echo */
      readonly pushableChange: boolean;
    }
  | {
      /** 这次写照常发生，但不产生单元 */
      readonly kind: 'no_capture';
      /** 为什么不产生 */
      readonly reason: NoCaptureReason;
      /** 恒为 `false` */
      readonly revisionBump: false;
    }
  | {
      /** 这次写**根本不许发生**；调用方必须在语句下发前抛 */
      readonly kind: 'reject';
      /** epic-006 的稳定错误码 */
      readonly code: typeof CommitErrorCode.commit_capability_mismatch;
      /** 恒为 `false` */
      readonly revisionBump: false;
    };

/**
 * 一次被门禁拒下的写
 *
 * @remarks
 * 拒绝发生在**语句执行前**，业务表零变化——不是写完再回滚。raw 通道上根本没有事务可回滚，
 * 而那正是 raw 通道存在的原因。
 *
 * 判别位给两个：`name` 供本进程内 `instanceof` 之外的兜底，`code` 供跨 realm 判别。
 * `entrance` 让调用方知道是哪条路被拦的——同一个码在四个挂载点与六个适配器上都可能抛出，
 * 没有它，日志里只剩「有人裸写了版本化表」。
 */
export class WorkingTreeWriteRejectedError extends RxDBError {
  /** epic-006 指定的稳定错误码，取自 {@link CommitErrorCode} */
  readonly code = CommitErrorCode.commit_capability_mismatch;

  /** 被拦下的那条写入口 */
  readonly entrance: WriteEntrance;

  /** 被写的实体名；raw 通道上解析不出实体时为 `undefined` */
  readonly entityName: string | undefined;

  /**
   * 由五个拒绝点构造：四个挂载点各自的门，加上 raw 通道的判定。
   *
   * @param rejection - 拒绝现场：被拦的入口、解析得到的实体名（raw 通道上可能解析不出）、
   *   以及已经拼好的文案
   *
   * @remarks
   * 收一个对象而不是三个位置参数：三者里有两个是字符串，位置参数下把 `entityName` 与
   * `message` 写反不会有编译错误，只会让日志里的实体名变成一整句话，而这个错误的用途
   * 恰恰就是让日志能回答「谁在裸写版本化表」。
   */
  constructor(rejection: { readonly entrance: WriteEntrance; readonly entityName?: string; readonly message: string }) {
    super(rejection.message);
    this.entrance = rejection.entrance;
    this.entityName = rejection.entityName;
    this.name = 'WorkingTreeWriteRejectedError';
    Object.setPrototypeOf(this, WorkingTreeWriteRejectedError.prototype);
  }
}

/** 三种结论的构造器，集中在这里以保证 `revisionBump` 与 `kind` 不会被分别设成不一致。 */
const CAPTURE_LOCAL: WriteEntranceDecision = {
  kind: 'capture',
  origin: 'local',
  revisionBump: true,
  pushableChange: true
};

/** 同步机制写下的单元：照样进工作树，但推回远端就是 push echo。 */
const CAPTURE_REMOTE: WriteEntranceDecision = {
  kind: 'capture',
  origin: 'remote_sync',
  revisionBump: true,
  pushableChange: false
};

/** 放行且不建单元。 */
const noCapture = (reason: NoCaptureReason): WriteEntranceDecision => ({
  kind: 'no_capture',
  reason,
  revisionBump: false
});

/** 拒绝；**只有**这一种结论带错误码。 */
const REJECT: WriteEntranceDecision = {
  kind: 'reject',
  code: CommitErrorCode.commit_capability_mismatch,
  revisionBump: false
};

/**
 * 这次写构成业务净变化吗
 *
 * @param request - 待判定的写
 * @returns 列集 ⊆ untracked 字段域的 UPDATE 为 `false`，其余一律 `true`
 *
 * @remarks
 * 三条各自独立的收紧，去掉任何一条都会开出一条绕过捕获的路：
 *
 * 1. **只有 UPDATE 可能构不成净变化。** INSERT 与 DELETE 本身就是净变化，`columns` 里填什么
 *    都不改变这点。看 `columns` 的话，`DELETE ... ` 配一个 `['remoteId']` 就能豁免。
 * 2. **判据是子集而不是交集。** 按交集判会让 `SET remoteId = ?, title = ?` 整条豁免，
 *    用户改的标题就此不在工作树里。
 * 3. **`whole_row` 与 `unknown` 都不是子集。** 前者说的是「这一行被整体替换」——哪怕这张表的
 *    每一列都在 untracked 清单里也一样；后者是 fail-closed：反过来的读法会让绕过捕获变成一道
 *    语法题，只要把语句写得判定读不懂就行。
 */
function hasNetChange(request: WriteEntranceRequest): boolean {
  if (request.operation !== 'update') return true;
  if (request.columns.kind !== 'columns') return true;
  const untracked = new Set(request.untrackedFields);
  return !request.columns.names.every(name => untracked.has(name));
}

/** 落单元的入口各自的来源；不在表里的入口不捕获。 */
const CAPTURING_ENTRANCES: ReadonlyMap<WriteEntrance, WriteEntranceDecision> = new Map([
  ['crud', CAPTURE_LOCAL],
  ['domain_recompute', CAPTURE_LOCAL],
  ['remote_entity_apply', CAPTURE_REMOTE],
  ['cleanup_expired', CAPTURE_REMOTE]
]);

/**
 * 版本化业务表上的入口分派；目标类短路之后只剩这一支。
 *
 * @param request - 待判定的写
 * @returns 该入口在版本化业务表上的结论
 */
function classifyVersionedTarget(request: WriteEntranceRequest): WriteEntranceDecision {
  const capture = CAPTURING_ENTRANCES.get(request.entrance);
  if (capture) return hasNetChange(request) ? capture : noCapture('no_net_change');
  // 行 6：物化必须写得进去。判成 reject 的话，切分支这件事本身会失败。
  if (request.entrance === 'projection_rewrite') return noCapture('domain_managed');
  // 行 9 第 5 步：只触及 untracked 字段域的 raw 写放行，且不因为「是 raw」而获得一个单元。
  if (request.entrance === 'raw_write' && !hasNetChange(request)) return noCapture('no_net_change');
  return REJECT;
}

/**
 * 判定一次写该不该落成工作树单元
 *
 * @param request - 谁在写、写哪一类表、写了哪些列
 * @returns 三种结论之一；**总函数**，任何组合都有结论，从不抛错
 *
 * @remarks
 * 顺序是契约的一部分：
 *
 * 1. **能力位最先，先于入口许可。** FR-046 要的是零行为差异——没启用提交能力的库上，raw 写、
 *    未知入口、`notifyExternalUpdate()` 都必须与没装这个特性时逐字节一致。放在入口许可之后
 *    判断的话，未启用的库会开始拒绝它一直允许的写法：升级即故障，故障点在完全没打算用这个
 *    功能的用户那里。
 * 2. **再按目标类短路。** 系统表与 QueryCache 表上没有需要保护的东西，于是「谁在写」这个问题
 *    只在版本化业务表上才需要回答。反过来（先按入口分派）要求每个入口分支各自再判一次目标类，
 *    十一个分支就有十一次抄写机会。
 *
 * 判定是**纯的**：不读全局状态、不改入参，同一份输入判两次结论相同。
 *
 * @example
 * ```ts
 * classifyWriteEntrance({
 *   entrance: 'remote_entity_apply',
 *   targetClass: 'versioned',
 *   operation: 'update',
 *   columns: { kind: 'columns', names: ['remoteId'] },
 *   untrackedFields: domain.untrackedFieldsOf('post'),
 *   capabilityEnabled: true
 * });
 * // → { kind: 'no_capture', reason: 'no_net_change', revisionBump: false }
 * ```
 */
export function classifyWriteEntrance(request: WriteEntranceRequest): WriteEntranceDecision {
  if (!request.capabilityEnabled) return noCapture('capability_disabled');
  if (request.targetClass === 'system') return noCapture('system_target');
  if (request.targetClass === 'query_cache') return noCapture('query_cache');
  return classifyVersionedTarget(request);
}

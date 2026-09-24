/**
 * @fileoverview 受信调用点的写意图声明通道（adapter-contract.md §3）。
 *
 * @remarks
 * 挂载点拿到的只有「有人在调 `switchBranch`」，拿不到「谁在调、为了什么」。而矩阵的行 4 与行 6
 * 结论相反——同一个 `switchBranch`，分支物化必须**不**产生单元，undo/redo 必须产生。缺了这条
 * 通道，两者在挂载点上不可区分，只能二选一地错一半。
 *
 * **声明挂在作用域对象上，不挂在模块级全局变量上。** 全局变量在两次并发写之间会串台：
 * A 声明了 `remote_sync`、还没走到写原语，B 声明了 `undo_redo`，于是 A 的写被记成 B 的意图。
 * 作用域对象天然把声明隔离在一次写里——`switchBranch` 以**适配器实例**为作用域，
 * `mergeChanges` 以**该事务的 executor** 为作用域，两者都是「这一次写」的天然身份。
 *
 * **适配器实例只够 `switchBranch` 用。** 它在调用钩子时**同步**消费声明，声明与取用之间没有
 * 排队窗口；`mergeChanges` 不是——工作树的 `interceptMergeChanges()` 先排队拿到事务，之后才取
 * 声明。于是每个作用域只存一条这件事，在适配器实例上就成了一个覆盖窗口：两个并发的
 * `adapter.mergeChanges()` 里，先执行的取到后声明者的意图（按错误的入口判定），后执行的取不到
 * 声明被当作未知入口拒绝。登记表里 6 行 `mergeChanges` 因此**一律**绑执行器；调用方手上没有
 * 执行器时，自己开一个事务（`merge-branch.ts` 的压缩出口与 `restore-entity.ts` 就是这么做的，
 * 并发用例在 `rxdb-plugin-history/src/__tests__/trusted-write-concurrency.spec.ts`）。
 *
 * **取用即清除**（{@link takeDeclaredWrite}）：声明只对紧随其后的那一次写有效。留着不清的话，
 * 下一次没声明的写会悄悄继承上一次的身份，而那正是 fail-closed 要拒绝的情形。
 */

import { RxDBError } from '../RxDBError.js';
import type { TrustedWriteIntent } from './trusted-write-intent.js';
import { TRUSTED_CALLSITE_REGISTRY, trustedCallsiteKey } from './trusted-write-intent.js';
import type { WriteEntrance } from './write-entrance.js';

/**
 * 一次受信写的自报身份
 *
 * @remarks
 * 三段与 {@link trustedCallsiteKey} 逐字对应，因为它就是拿来查登记表的。让调用点直接报
 * `entrance` 反而更糟：登记表与调用点各存一份入口，改一处漏一处时没有任何东西会报错。
 */
export interface TrustedWriteDeclaration {
  /**
   * 调用点所在文件的**基名**
   *
   * @remarks
   * 不带包名也不带目录，与 {@link TRUSTED_CALLSITE_REGISTRY} 的 `file` 列同构。US-025 把 9 个
   * 调用点从 `packages/rxdb/src/version/` 搬进了 `@aiao/rxdb-plugin-history` 与
   * `@aiao/rxdb-plugin-sync`，基名键正是为此：搬迁只换了目录，键一格都没动。
   */
  readonly file: string;

  /** 发起这次写的最内层具名函数 */
  readonly symbol: string;

  /** 调用点自报的意图 */
  readonly intent: TrustedWriteIntent;
}

/** 已解析出入口的声明；{@link takeDeclaredWrite} 的返回形态。 */
export interface ResolvedTrustedWrite extends TrustedWriteDeclaration {
  /** 该登记行在写入口语义矩阵里的行 */
  readonly entrance: WriteEntrance;
}

/**
 * 作用域对象：适配器实例或事务执行器。
 *
 * @remarks
 * 故意宽到 `object`：核心包不该为了一个 WeakMap 的键去 import 适配器类型，那会把
 * `rxdb-adapter.ts → working-tree → rxdb-adapter.ts` 的环从「类型擦除后消失」变成真环。
 */
export type TrustedWriteScope = object;

/** 登记表的入口索引；键与 {@link trustedCallsiteKey} 同构。 */
const ENTRANCE_BY_KEY: ReadonlyMap<string, WriteEntrance> = new Map(
  TRUSTED_CALLSITE_REGISTRY.map(callsite => [trustedCallsiteKey(callsite), callsite.entrance])
);

/** 每个作用域至多一条待取用的声明。 */
const DECLARED = new WeakMap<TrustedWriteScope, ResolvedTrustedWrite>();

/**
 * 声明紧接着这一次写的意图
 *
 * @param scope - 适配器实例（适配器级原语）或事务执行器（事务内原语）
 * @param declaration - 与登记表同一行的三段身份
 * @throws {@link RxDBError} 三段身份不在 {@link TRUSTED_CALLSITE_REGISTRY} 里时
 *
 * @remarks
 * 未登记的身份**抛错而不是按未知入口放行**：放行的话，新增一个批量重写调用点只需要随手编一个
 * 文件名就能绕开漂移扫描，而扫描正是 SC-010 的全部内容。抛错则让「新增调用点」与「更新登记表」
 * 必须同一次提交完成。
 *
 * **三段身份是调用方自报的，运行时只查表、不核对调用方真的在那个文件那个符号里——这是设计，
 * 不是遗漏。** 它挡的是**漂移**：新写一处批量重写却忘了登记，在这儿当场抛错（fail-closed）。
 * 它挡不住**仿冒**：一个照着登记表填三段字符串的调用方会被放行。但能走到这一步的代码已经
 * `import` 了核心包、拿到了 adapter 实例，它直接调 `adapter.mergeChanges()` 比仿冒一个键更省事
 * ——这道门禁不是防御边界，是一致性契约（`specs/001-working-tree-commits/threat-model.md` §4）。
 */
export function declareTrustedWrite(scope: TrustedWriteScope, declaration: TrustedWriteDeclaration): void {
  const entrance = ENTRANCE_BY_KEY.get(trustedCallsiteKey(declaration));
  if (!entrance) {
    throw new RxDBError(
      `未登记的受信写调用点 ${declaration.file}·${declaration.symbol}·${declaration.intent}：` +
        '先把它加进 TRUSTED_CALLSITE_REGISTRY（adapter-contract.md §3），再声明意图。'
    );
  }
  DECLARED.set(scope, { ...declaration, entrance });
}

/**
 * 取出并清除这个作用域上的声明
 *
 * @param scope - 声明时用的同一个作用域对象
 * @returns 已解析入口的声明；没有声明时为 `undefined`
 */
export function takeDeclaredWrite(scope: TrustedWriteScope): ResolvedTrustedWrite | undefined {
  const declared = DECLARED.get(scope);
  if (declared) DECLARED.delete(scope);
  return declared;
}

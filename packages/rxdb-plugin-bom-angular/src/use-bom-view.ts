import { type RxDB } from '@aiao/rxdb';
import {
  createBomView,
  createBomViewSession,
  initialBomViewState,
  type BomViewCommands,
  type BomViewInput,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { DestroyRef, effect, inject, isSignal, signal, untracked, type Signal } from '@angular/core';

/** Angular signal 与共享 BOM 命令。 */
export interface BomViewBinding {
  state: Signal<BomViewState>;
  commands: BomViewCommands;
}

/**
 * 在 Angular 注入上下文绑定显式数据库上的共享 BOM 控制器，随宿主销毁释放。
 *
 * @remarks
 * 与 React / Vue 的 `useBomView` 同一语义：输入按内容身份比较，内容相同的新对象不会重载；
 * `db` 身份变化时销毁旧控制器并以当前输入新建，旧流的迟到值不会写入状态。跟踪来源是
 * `Signal`：`input` signal 换成内容不同的值时自动 `setInput`。普通值只在创建时读取一次
 * （注入上下文里只调用一次，没有重读时机），之后的原地修改不会生效；需要切换请传 `Signal`
 * 或直接调用 `commands.setInput`。控制器在宿主首次变更检测的 effect 中创建，此前与销毁之后
 * 调用命令会明确抛错。
 *
 * @example
 * ```ts
 * readonly db = input.required<RxDB>();
 * readonly query = input.required<BomViewInput>();
 * readonly view = useBomView(this.db, this.query);
 * ```
 *
 * @param db - 已连接并安装 BOM 插件的数据库；普通值（只读一次）或 `Signal`
 * @param input - 完整解析上下文、目标、计划量、预算与公式参数；普通值（只读一次）或 `Signal`
 * @returns 只读状态 signal 与共享领域命令
 */
export const useBomView = (db: RxDB | Signal<RxDB>, input: BomViewInput | Signal<BomViewInput>): BomViewBinding => {
  const destroyRef = inject(DestroyRef);
  const state = signal(initialBomViewState());
  const session = createBomViewSession(createBomView, value => state.set(value));
  const syncRef = effect(() => {
    const nextDb = isSignal(db) ? db() : db;
    const nextInput = isSignal(input) ? input() : input;
    untracked(() => session.sync(nextDb, nextInput));
  });
  destroyRef.onDestroy(() => {
    syncRef.destroy();
    session.release();
  });
  return { state: state.asReadonly(), commands: session.commands };
};

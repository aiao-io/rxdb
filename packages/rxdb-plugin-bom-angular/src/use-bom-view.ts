import { deterministicStringify, type RxDB } from '@aiao/rxdb';
import {
  createBomView,
  initialBomViewState,
  type BomViewCommands,
  type BomViewHandle,
  type BomViewInput,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { DestroyRef, effect, inject, isSignal, signal, untracked, type Signal } from '@angular/core';
import type { Subscription } from 'rxjs';

/** 输入的内容身份；与 React / Vue 绑定逐字同一判据，无效日期经 JSON 归一为 null 而不抛错。 */
const inputIdentity = (input: BomViewInput): string =>
  deterministicStringify(JSON.parse(JSON.stringify(input)) as unknown);

/** Angular signal 与共享 BOM 命令。 */
export interface BomViewBinding {
  state: Signal<BomViewState>;
  commands: BomViewCommands;
}

/**
 * 在 Angular 注入上下文绑定显式数据库上的共享 BOM 控制器，随宿主销毁释放。
 *
 * @remarks
 * 与 React / Vue 的 `useBomView` 同一语义：`input` 按内容身份跟踪，内容变化时自动
 * `setInput`，内容相同的新对象不会重载；`db` 身份变化时销毁旧控制器并以当前输入新建，
 * 旧流的迟到值不会写入状态。控制器在宿主首次变更检测的 effect 中创建，此前与销毁之后
 * 调用命令会明确抛错。
 *
 * @example
 * ```ts
 * readonly db = input.required<RxDB>();
 * readonly query = input.required<BomViewInput>();
 * readonly view = useBomView(this.db, this.query);
 * ```
 *
 * @param db - 已连接并安装 BOM 插件的数据库；普通值或 `Signal`
 * @param input - 完整解析上下文、目标、计划量、预算与公式参数；普通值或 `Signal`
 * @returns 只读状态 signal 与共享领域命令
 */
export const useBomView = (db: RxDB | Signal<RxDB>, input: BomViewInput | Signal<BomViewInput>): BomViewBinding => {
  const destroyRef = inject(DestroyRef);
  const state = signal(initialBomViewState());
  let active: BomViewHandle | null = null;
  let activeDb: RxDB | null = null;
  let appliedInput: string | null = null;
  let subscription: Subscription | null = null;

  const release = (): void => {
    subscription?.unsubscribe();
    active?.destroy();
    subscription = null;
    active = null;
    activeDb = null;
  };
  const install = (nextDb: RxDB, nextInput: BomViewInput): void => {
    release();
    const handle = createBomView(nextDb, nextInput);
    active = handle;
    activeDb = nextDb;
    appliedInput = inputIdentity(nextInput);
    subscription = handle.state$.subscribe(value => state.set(value));
  };
  const sync = (nextDb: RxDB, nextInput: BomViewInput): void => {
    if (active === null || nextDb !== activeDb) {
      install(nextDb, nextInput);
      return;
    }
    const key = inputIdentity(nextInput);
    if (key === appliedInput) return;
    appliedInput = key;
    active.setInput(nextInput);
  };
  const current = (): BomViewHandle => {
    if (active === null) throw new Error('BOM 视图尚未挂载或已经卸载');
    return active;
  };

  const syncRef = effect(() => {
    const nextDb = isSignal(db) ? db() : db;
    const nextInput = isSignal(input) ? input() : input;
    untracked(() => sync(nextDb, nextInput));
  });
  destroyRef.onDestroy(() => {
    syncRef.destroy();
    release();
  });

  const commands: BomViewCommands = {
    setInput: value => current().setInput(value),
    refresh: () => current().refresh(),
    toggle: path => current().toggle(path),
    loadOccurrence: id => current().loadOccurrence(id),
    saveOccurrence: patch => current().saveOccurrence(patch),
    calculate: () => current().calculate()
  };
  return { state: state.asReadonly(), commands };
};

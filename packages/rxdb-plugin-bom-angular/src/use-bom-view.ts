import type { RxDB } from '@aiao/rxdb';
import {
  createBomView,
  initialBomViewState,
  type BomViewCommands,
  type BomViewInput,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/** Angular signal 与共享 BOM 命令。 */
export interface BomViewBinding {
  state: Signal<BomViewState>;
  commands: BomViewCommands;
}

/**
 * 在 Angular 注入上下文绑定显式数据库，随宿主销毁释放共享控制器。
 *
 * @param db - 已连接并安装 BOM 插件的数据库
 * @param input - 完整解析上下文、目标、计划量、预算与公式参数
 * @returns 只读状态 signal 与共享领域命令
 */
export const useBomView = (db: RxDB, input: BomViewInput): BomViewBinding => {
  const destroyRef = inject(DestroyRef);
  const handle = createBomView(db, input);
  const state = signal(initialBomViewState());
  const subscription = handle.state$.subscribe(value => state.set(value));
  destroyRef.onDestroy(() => {
    subscription.unsubscribe();
    handle.destroy();
  });
  const commands: BomViewCommands = {
    setInput: value => handle.setInput(value),
    refresh: () => handle.refresh(),
    toggle: path => handle.toggle(path),
    loadOccurrence: id => handle.loadOccurrence(id),
    saveOccurrence: patch => handle.saveOccurrence(patch),
    calculate: () => handle.calculate()
  };
  return { state: state.asReadonly(), commands };
};

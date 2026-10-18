import type { RxDB } from '@aiao/rxdb';
import type { BomViewCommands, BomViewInput, BomViewState } from '@aiao/rxdb-plugin-bom';
import { createBomView, initialBomViewState } from '@aiao/rxdb-plugin-bom';
import { getCurrentScope, onScopeDispose, shallowReadonly, shallowRef, type ShallowRef } from 'vue';

/** Vue的只读shallowRef容器与共享命令。 */
export interface BomViewBinding {
  state: Readonly<ShallowRef<BomViewState>>;
  commands: BomViewCommands;
}

/**
 * 将显式数据库上的共享 BOM 控制器绑定到当前 Vue scope。
 *
 * @param db - 已连接并安装 BOM 插件的数据库
 * @param input - 完整的解析上下文、目标、计划量、预算与公式参数
 * @returns 只读状态与共享命令，scope 销毁时自动释放订阅
 */
export const useBomView = (db: RxDB, input: BomViewInput): BomViewBinding => {
  if (!getCurrentScope()) throw new Error('useBomView 必须在 setup 或活动 effectScope 作用域中调用');
  const handle = createBomView(db, input);
  const state = shallowRef(initialBomViewState());
  const subscription = handle.state$.subscribe(value => {
    state.value = value;
  });
  onScopeDispose(() => {
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
  return { state: shallowReadonly(state), commands };
};

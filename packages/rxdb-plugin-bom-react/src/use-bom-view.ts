import { deterministicStringify, type RxDB } from '@aiao/rxdb';
import {
  createBomView,
  initialBomViewState,
  type BomViewCommands,
  type BomViewHandle,
  type BomViewInput,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

/** 输入的内容身份；与 Angular / Vue 绑定逐字同一判据，无效日期经 JSON 归一为 null 而不抛错。 */
const inputIdentity = (input: BomViewInput): string =>
  deterministicStringify(JSON.parse(JSON.stringify(input)) as unknown);

/** React 的普通快照与共享命令。 */
export interface BomViewBinding {
  state: BomViewState;
  commands: BomViewCommands;
}

/**
 * 订阅显式数据库下的 BOM 视图，返回 React 快照与共享命令。
 *
 * @remarks
 * 与 Angular / Vue 的 `useBomView` 同一语义：`input` 按内容身份跟踪，内容变化时自动
 * `setInput`，内容相同的新对象不会重载；`db` 身份变化时销毁旧控制器并以当前输入新建，
 * 旧流的迟到值不会写入状态。控制器在首次提交的 layout effect 中创建，此前与卸载之后
 * 调用命令会明确抛错。
 *
 * @param db - 已连接并安装BOM插件的显式数据库，可供多份绑定使用
 * @param input - 完整解析上下文、目标、计划量、预算与公式参数
 * @returns 普通状态快照与共享命令，卸载时释放订阅和控制器
 */
export const useBomView = (db: RxDB, input: BomViewInput): BomViewBinding => {
  const [state, setState] = useState(initialBomViewState);
  const current = useRef<BomViewHandle | null>(null);
  const latestInput = useRef(input);
  const appliedInput = useRef<string | null>(null);
  const inputKey = inputIdentity(input);
  latestInput.current = input;
  const commands = useMemo<BomViewCommands>(() => {
    const handle = (): BomViewHandle => {
      if (current.current === null) throw new Error('BOM 视图尚未挂载或已经卸载');
      return current.current;
    };
    return {
      setInput: value => handle().setInput(value),
      refresh: () => handle().refresh(),
      toggle: path => handle().toggle(path),
      loadOccurrence: id => handle().loadOccurrence(id),
      saveOccurrence: patch => handle().saveOccurrence(patch),
      calculate: () => handle().calculate()
    };
  }, []);
  useLayoutEffect(() => {
    const handle = createBomView(db, latestInput.current);
    appliedInput.current = inputIdentity(latestInput.current);
    current.current = handle;
    const subscription = handle.state$.subscribe(setState);
    return () => {
      current.current = null;
      subscription.unsubscribe();
      handle.destroy();
    };
  }, [db]);
  useLayoutEffect(() => {
    if (appliedInput.current === inputKey) return;
    appliedInput.current = inputKey;
    current.current?.setInput(input);
  }, [db, input, inputKey]);
  return { state, commands };
};

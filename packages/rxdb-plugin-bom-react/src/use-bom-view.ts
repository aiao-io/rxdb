import { type RxDB } from '@aiao/rxdb';
import {
  createBomView,
  createBomViewSession,
  initialBomViewState,
  type BomViewCommands,
  type BomViewInput,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { useLayoutEffect, useMemo, useState } from 'react';

/** React 的普通快照与共享命令。 */
export interface BomViewBinding {
  state: BomViewState;
  commands: BomViewCommands;
}

/**
 * 订阅显式数据库下的 BOM 视图，返回 React 快照与共享命令。
 *
 * @remarks
 * 与 Angular / Vue 的 `useBomView` 同一语义：输入按内容身份比较，内容相同的新对象不会重载；
 * `db` 身份变化时销毁旧控制器并以当前输入新建，旧流的迟到值不会写入状态。React 每次渲染
 * 都按内容重新比较传入的 `input`，内容变化时自动 `setInput`。控制器在首次提交的 layout
 * effect 中创建，此前与卸载之后调用命令会明确抛错。
 *
 * @param db - 已连接并安装BOM插件的显式数据库，可供多份绑定使用
 * @param input - 完整解析上下文、目标、计划量、预算与公式参数
 * @returns 普通状态快照与共享命令，卸载时释放订阅和控制器
 */
export const useBomView = (db: RxDB, input: BomViewInput): BomViewBinding => {
  const [state, setState] = useState(initialBomViewState);
  const session = useMemo(() => createBomViewSession(createBomView, setState), []);
  const inputKey = session.inputIdentity(input);
  useLayoutEffect(() => () => session.release(), [db, session]);
  useLayoutEffect(() => {
    session.sync(db, input);
  }, [db, input, inputKey, session]);
  return { state, commands: session.commands };
};

import {
  BOM_VIEW_STYLES,
  bomErrorText,
  type BomViewCommands,
  type BomViewNode,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

/**
 * 渲染共享控制器提供的可见 BOM 路径、候选与查询状态（对齐 Angular `ao-bom-tree`、Vue `BomTree`）。
 *
 * @remarks
 * 交互一律经 `commands` 回到共享控制器。键盘遵循 WAI-ARIA tree 模式：方向键移动焦点
 * （ArrowLeft 无父节点时不动），Home/End 跳到首尾，Space 切换展开，Enter 加载发生项；
 * 当前焦点节点不在可见节点中时首行是 Tab 入口。
 *
 * @param props - 共享状态与命令
 * @returns 支持键盘操作的 BOM 树
 */
export const BomTree = ({ state, commands }: { state: BomViewState; commands: BomViewCommands }): ReactElement => {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [focused, setFocused] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<unknown>(null);
  const focus = (index: number): void => {
    const node = state.nodes[Math.max(0, Math.min(index, state.nodes.length - 1))];
    if (node) rows.current.get(node.key)?.focus();
  };
  const edit = async (node: BomViewNode): Promise<void> => {
    if (node.occurrenceId === null) return;
    setInteractionError(null);
    try {
      await commands.loadOccurrence(node.occurrenceId);
    } catch (error) {
      setInteractionError(error);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLLIElement>, node: BomViewNode, index: number): void => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') focus(index + 1);
    if (event.key === 'ArrowUp') focus(index - 1);
    if (event.key === 'Home') focus(0);
    if (event.key === 'End') focus(state.nodes.length - 1);
    if (event.key === 'Enter') void edit(node);
    if (event.key === ' ' && node.hasChildren) commands.toggle(node.path);
    if (event.key === 'ArrowRight' && node.hasChildren && !node.expanded) commands.toggle(node.path);
    const next = state.nodes[index + 1];
    if (event.key === 'ArrowRight' && node.expanded && next && next.depth > node.depth) focus(index + 1);
    if (event.key !== 'ArrowLeft') return;
    if (node.hasChildren && node.expanded) commands.toggle(node.path);
    else rows.current.get(JSON.stringify(node.path.slice(0, -1)))?.focus();
  };
  const hasFocused = state.nodes.some(node => node.key === focused);
  return (
    <section
      className='bom-view bom-tree'
      aria-label='BOM 展开'
      aria-busy={state.refreshing || state.phase === 'loading'}
    >
      <style>{BOM_VIEW_STYLES}</style>
      {(state.phase === 'idle' || state.phase === 'loading') && <p role='status'>正在加载 BOM…</p>}
      {state.phase === 'empty' && <p role='status'>没有可见 BOM 节点</p>}
      {state.refreshing && <p role='status'>正在刷新 BOM…</p>}
      {state.error !== null && <p role='alert'>{bomErrorText(state.error)}</p>}
      {state.phase === 'error' && (
        <button type='button' onClick={() => commands.refresh()}>
          重试
        </button>
      )}
      <ul role='tree' aria-label='BOM 结构'>
        {state.nodes.map((node, index) => (
          <li
            key={node.key}
            role='treeitem'
            data-testid='bom-node'
            data-path={node.key}
            data-occurrence={node.occurrenceId ?? ''}
            aria-level={node.depth + 1}
            aria-expanded={node.hasChildren ? node.expanded : undefined}
            aria-selected={node.occurrenceId !== null && state.editor.value?.occurrenceId === node.occurrenceId}
            tabIndex={focused === node.key || (!hasFocused && index === 0) ? 0 : -1}
            ref={element => {
              if (element) rows.current.set(node.key, element);
              else rows.current.delete(node.key);
            }}
            onFocus={() => setFocused(node.key)}
            onKeyDown={event => keyDown(event, node, index)}
            onClick={() => {
              rows.current.get(node.key)?.focus();
              void edit(node);
            }}
          >
            <div className='bom-node-content' style={{ paddingInlineStart: node.depth * 24 }}>
              {node.hasChildren && (
                <button
                  type='button'
                  tabIndex={-1}
                  aria-label={`${node.expanded ? '折叠' : '展开'} ${node.itemNo}`}
                  onClick={event => {
                    event.stopPropagation();
                    commands.toggle(node.path);
                  }}
                >
                  {node.expanded ? '−' : '+'}
                </button>
              )}
              <span>{node.itemNo}</span>
              {node.description && <span>{node.description}</span>}
              <span className='bom-node-quantity' data-testid='bom-quantity'>
                {node.quantity ? `${node.quantity.value} ${node.quantity.uom}` : '未解析'}
              </span>
              {node.occurrenceId !== null && (
                <button
                  type='button'
                  tabIndex={-1}
                  aria-label={`编辑 ${node.itemNo}`}
                  onClick={event => {
                    event.stopPropagation();
                    void edit(node);
                  }}
                >
                  编辑
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {state.unresolved.length > 0 && (
        <section aria-label='未解析候选'>
          <h3>未解析</h3>
          {state.unresolved.map(group => (
            <div key={group.key} data-testid='bom-candidate'>
              <span>{group.kind}</span>
              <ul>
                {group.candidates.map(candidate => (
                  <li key={candidate.key}>{candidate.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {state.truncated !== null && <p role='note'>结果已截断：{state.truncated.reason}</p>}
      {state.quantityError !== null && <p role='alert'>{bomErrorText(state.quantityError)}</p>}
      {interactionError !== null && <p role='alert'>{bomErrorText(interactionError)}</p>}
    </section>
  );
};

import { Edit3, Eye, FolderOpen, Trash2 } from 'lucide-react';
import { useGlobalDismiss } from '../../../hooks/useGlobalDismiss';
import type { OPFSFileEntry } from '../utils/opfs-utils';

export type OpfsContextMenuAction = 'view' | 'rename' | 'delete';

export interface OpfsContextMenuProps {
  entry: OPFSFileEntry;
  /** 视口坐标（右键点击处）。 */
  x: number;
  y: number;
  onAction: (action: OpfsContextMenuAction) => void;
  onClose: () => void;
}

/**
 * OPFS 文件列表的右键菜单。
 *
 * @remarks
 * 从 `opfs.tsx` 里抽出来，原因是那两条缺陷在页面内部**测不到**：页面要连 OPFS、
 * 要 RxDB context，任何断言都跑不起来 —— 于是"点外面不关"和"li 直接塞在 div 里"
 * 两条问题在评审前一直没人拦。
 *
 * - P1-3：菜单只有自身的 `onClick={stopPropagation}`，没有任何全局 click / Escape 监听。
 *   右键出菜单后点页面别处、按 Esc、甚至滚动，菜单都一直挂在原坐标上，
 *   直到再次右键或触发某个动作为止。
 * - P1-4：菜单项是 `<li>`，容器却是 `<div className='menu'>`。`<li>` 的内容模型要求父级是
 *   `ul` / `ol` / `menu`，浏览器不会给它 list 语义，辅助技术读不到"3 项菜单"。
 *   （daisyUI 的 `menu` 也是给 `<ul>` 用的。）
 */
export function OpfsContextMenu({ entry, x, y, onAction, onClose }: OpfsContextMenuProps) {
  useGlobalDismiss(true, onClose);

  return (
    <ul
      className='menu border-base-content/10 bg-base-300/95 fixed z-50 w-40 rounded-lg border p-1.5 text-sm shadow-2xl'
      style={{
        left: x,
        top: y,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }}
      // 菜单内部的点击不能冒泡到 document，否则上面的关闭监听会在动作执行前先把它关掉。
      onClick={event => event.stopPropagation()}
    >
      <li>
        <button className='w-full gap-2 px-2 py-1.5 text-left' type='button' onClick={() => onAction('view')}>
          {entry.kind === 'file' ?
            <>
              <Eye size={14} />
              <span>查看</span>
            </>
          : <>
              <FolderOpen size={14} />
              <span>打开</span>
            </>
          }
        </button>
      </li>
      <li>
        <button className='w-full gap-2 px-2 py-1.5 text-left' type='button' onClick={() => onAction('rename')}>
          <Edit3 size={14} />
          <span>重命名</span>
        </button>
      </li>
      <li>
        <button
          className='text-error w-full gap-2 px-2 py-1.5 text-left'
          type='button'
          onClick={() => onAction('delete')}
        >
          <Trash2 size={14} />
          <span>删除</span>
        </button>
      </li>
    </ul>
  );
}

import { STORAGE_TESTID } from '@aiao/utils';
import { Download, Edit3, Eye, FolderOpen, Trash2 } from 'lucide-react';
import type { StorageBrowserItem } from '../utils/storage-utils';

export type StorageContextMenuAction = 'view' | 'download' | 'rename' | 'delete';

interface StorageContextMenuProps {
  entry: StorageBrowserItem | null;
  show: boolean;
  x: number;
  y: number;
  onAction: (action: StorageContextMenuAction) => void;
}

export function StorageContextMenu({ entry, show, x, y, onAction }: StorageContextMenuProps): React.JSX.Element | null {
  const T = STORAGE_TESTID;

  if (!show || !entry) {
    return null;
  }

  return (
    // P1-4：容器必须是 <ul>。菜单项是 <li>，而 <li> 的内容模型要求父级为 ul / ol / menu，
    // 挂在 <div> 下浏览器不给 list 语义，辅助技术读不到"这是一个 4 项菜单"。
    // （daisyUI 的 `menu` 类本身也是给 <ul> 用的。）
    <ul
      className='menu border-base-content/10 bg-base-300/95 fixed z-50 w-40 rounded-lg border p-1.5 text-sm shadow-2xl'
      data-testid={T.CONTEXT_MENU}
      onClick={event => event.stopPropagation()}
      style={{
        left: x,
        top: y,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }}
    >
      <li>
        <button
          className='w-full gap-2 px-2 py-1.5 text-left'
          data-testid={T.CONTEXT_VIEW}
          onClick={() => onAction('view')}
          type='button'
        >
          {entry.kind === 'file' ?
            <>
              <Eye size={14} />
              <span>View</span>
            </>
          : <>
              <FolderOpen size={14} />
              <span>Open</span>
            </>
          }
        </button>
      </li>
      <li>
        <button
          className='w-full gap-2 px-2 py-1.5 text-left'
          data-testid={T.CONTEXT_DOWNLOAD}
          onClick={() => onAction('download')}
          type='button'
        >
          <Download size={14} />
          <span>{entry.kind === 'file' ? 'Download' : 'Download ZIP'}</span>
        </button>
      </li>
      <li>
        <button
          className='w-full gap-2 px-2 py-1.5 text-left'
          data-testid={T.CONTEXT_RENAME}
          onClick={() => onAction('rename')}
          type='button'
        >
          <Edit3 size={14} />
          <span>Rename</span>
        </button>
      </li>
      <li>
        <button
          className='text-error w-full gap-2 px-2 py-1.5 text-left'
          data-testid={T.CONTEXT_DELETE}
          onClick={() => onAction('delete')}
          type='button'
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      </li>
    </ul>
  );
}

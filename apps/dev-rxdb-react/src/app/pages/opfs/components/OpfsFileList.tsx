/**
 * OPFS 文件列表组件
 */

import { Download, Eye, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { useResettableTimeout } from '../../../hooks/useResettableTimeout';
import {
  canPreviewFile,
  formatDate,
  formatFileSize,
  getFileIcon,
  getFileIconColor,
  OPFSFileEntry
} from '../utils/opfs-utils';

interface Props {
  entries: OPFSFileEntry[];
  currentPath: string;
  selectedPaths: Set<string>;
  onNavigate: (entry: OPFSFileEntry) => void;
  onDownload: (entry: OPFSFileEntry) => void;
  onDelete: (entry: OPFSFileEntry) => void;
  onPreview: (entry: OPFSFileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry: OPFSFileEntry) => void;
  onEntryClick: (entry: OPFSFileEntry, event: React.MouseEvent) => void;
}

export function OpfsFileList({
  entries,
  selectedPaths,
  onNavigate,
  onDownload,
  onDelete,
  onPreview,
  onContextMenu,
  onEntryClick
}: Props) {
  const { schedule: scheduleEntryClick, cancel: cancelEntryClick } = useResettableTimeout();

  const handleEntryClick = useCallback(
    (entry: OPFSFileEntry, event: React.MouseEvent) => {
      scheduleEntryClick(() => onEntryClick(entry, event), 250);
    },
    [onEntryClick, scheduleEntryClick]
  );

  const handleDoubleClick = useCallback(
    (entry: OPFSFileEntry) => {
      cancelEntryClick();
      if (entry.kind === 'directory') onNavigate(entry);
      else onPreview(entry);
    },
    [cancelEntryClick, onNavigate, onPreview]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, entry: OPFSFileEntry) => {
      event.preventDefault();
      onContextMenu(event, entry);
    },
    [onContextMenu]
  );

  return (
    <table className='table-zebra table select-none'>
      <thead>
        <tr>
          <th>名称</th>
          <th className='w-32'>大小</th>
          <th className='w-40'>修改时间</th>
          <th className='w-24'>操作</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(entry => {
          const Icon = getFileIcon(entry);
          const iconColor = getFileIconColor(entry);
          const isSelected = selectedPaths.has(entry.path);

          return (
            <tr
              key={entry.path}
              className={`cursor-pointer ${isSelected ? 'bg-primary/10' : 'hover:bg-base-200'}`}
              data-entry-path={entry.path}
              onClick={e => handleEntryClick(entry, e)}
              onContextMenu={e => handleContextMenu(e, entry)}
              onDoubleClick={() => handleDoubleClick(entry)}
            >
              <td className='font-medium'>
                {entry.kind === 'directory' ?
                  <button
                    className='flex items-center gap-1.5 hover:underline'
                    onClick={e => {
                      e.stopPropagation();
                      onNavigate(entry);
                    }}
                  >
                    <Icon size={16} className={iconColor} />
                    {entry.name}
                  </button>
                : <div className='flex items-center gap-1.5'>
                    <Icon size={16} className={iconColor} />
                    <span>{entry.name}</span>
                  </div>
                }
              </td>
              <td className='text-base-content/60 text-sm'>
                {entry.kind === 'file' ? formatFileSize(entry.size || 0) : '-'}
              </td>
              <td className='text-base-content/60 text-sm'>{formatDate(entry.lastModified)}</td>
              <td>
                <div className='flex items-center gap-1'>
                  {entry.kind === 'file' && canPreviewFile(entry) && (
                    <button
                      className='btn btn-ghost btn-xs'
                      onClick={e => {
                        e.stopPropagation();
                        onPreview(entry);
                      }}
                      title='预览'
                    >
                      <Eye size={14} />
                    </button>
                  )}
                  {entry.kind === 'file' && (
                    <button
                      className='btn btn-ghost btn-xs'
                      onClick={e => {
                        e.stopPropagation();
                        onDownload(entry);
                      }}
                      title='下载'
                    >
                      <Download size={14} />
                    </button>
                  )}
                  <button
                    className='btn btn-ghost btn-xs text-error'
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(entry);
                    }}
                    title='删除'
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

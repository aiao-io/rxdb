import { formatFileDate, formatFileSize } from '@modules/demo-i18n/files';
/**
 * OPFS 文件列表组件
 */

import { useI18n } from '@aiao/rxdb-i18n-react';
import { Download, Eye, Pen, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { useResettableTimeout } from '../../../hooks/useResettableTimeout';
import { canPreviewFile, getFileIcon, getFileIconColor, OPFSFileEntry } from '../utils/opfs-utils';

interface Props {
  entries: OPFSFileEntry[];
  currentPath: string;
  selectedPaths: Set<string>;
  onNavigate: (entry: OPFSFileEntry) => void;
  onDownload: (entry: OPFSFileEntry) => void;
  onDelete: (entry: OPFSFileEntry) => void;
  onPreview: (entry: OPFSFileEntry) => void;
  onRename: (entry: OPFSFileEntry) => void;
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
  onRename,
  onContextMenu,
  onEntryClick
}: Props) {
  const { locale, t } = useI18n();
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
          <th>{t('file.name')}</th>
          <th className='w-32'>{t('file.size')}</th>
          <th className='hidden w-40 md:table-cell'>{t('file.modified')}</th>
          <th className='w-24'>{t('file.actions')}</th>
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
                {entry.kind === 'file' ? formatFileSize(entry.size || 0, locale) : '-'}
              </td>
              <td className='text-base-content/60 hidden text-sm md:table-cell'>
                {formatFileDate(entry.lastModified, locale)}
              </td>
              <td>
                <div className='flex items-center gap-1'>
                  {entry.kind === 'file' && canPreviewFile(entry) && (
                    <button
                      className='btn btn-ghost btn-xs'
                      onClick={e => {
                        e.stopPropagation();
                        onPreview(entry);
                      }}
                      title={t('file.preview')}
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
                      title={t('file.download')}
                    >
                      <Download size={14} />
                    </button>
                  )}
                  <button
                    className='btn btn-ghost btn-xs'
                    data-testid='opfs-rename-btn'
                    onClick={event => {
                      event.stopPropagation();
                      onRename(entry);
                    }}
                    title={t('file.rename')}
                  >
                    <Pen size={14} />
                  </button>
                  <button
                    className='btn btn-ghost btn-xs text-error'
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(entry);
                    }}
                    title={t('file.delete')}
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

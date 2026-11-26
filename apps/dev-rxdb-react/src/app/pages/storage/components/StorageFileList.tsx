import { useI18n } from '@aiao/rxdb-i18n-react';
import { STORAGE_TESTID } from '@aiao/utils';
import { formatFileDate, formatFileSize } from '@modules/demo-i18n/files';
import { Download, Eye, FolderOpen, Pen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { canPreviewFile, getFileIcon, getFileIconColor, StorageBrowserItem } from '../utils/storage-utils';

interface Props {
  entries: StorageBrowserItem[];
  currentPath: string;
  selectedPaths: Set<string>;
  onNavigate: (entry: StorageBrowserItem) => void;
  onDownload: (entry: StorageBrowserItem) => void;
  onDelete: (entry: StorageBrowserItem) => void;
  onPreview: (entry: StorageBrowserItem) => void;
  onRename: (entry: StorageBrowserItem) => void;
  onContextMenu: (event: React.MouseEvent, entry: StorageBrowserItem) => void;
  onEntryClick: (entry: StorageBrowserItem, event: React.MouseEvent) => void;
}

export function StorageFileList({
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
  const clickTimeoutRef = useRef<number | null>(null);
  const T = STORAGE_TESTID;

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleEntryClick = useCallback(
    (entry: StorageBrowserItem, event: React.MouseEvent) => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = window.setTimeout(() => {
        onEntryClick(entry, event);
        clickTimeoutRef.current = null;
      }, 250);
    },
    [onEntryClick]
  );

  const handleDoubleClick = useCallback(
    (entry: StorageBrowserItem) => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      if (entry.kind === 'directory') {
        onNavigate(entry);
        return;
      }

      onPreview(entry);
    },
    [onNavigate, onPreview]
  );

  return (
    <table className='table-zebra table select-none' data-testid={T.FILE_LIST}>
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
              data-testid={entry.kind === 'file' ? T.FILE_ROW : undefined}
              onClick={event => handleEntryClick(entry, event)}
              onContextMenu={event => {
                event.preventDefault();
                onContextMenu(event, entry);
              }}
              onDoubleClick={() => handleDoubleClick(entry)}
            >
              <td className='font-medium' data-testid={entry.kind === 'file' ? T.FILE_NAME : undefined}>
                {entry.kind === 'directory' ?
                  <button
                    className='flex items-center gap-1.5 hover:underline'
                    onClick={event => {
                      event.stopPropagation();
                      onNavigate(entry);
                    }}
                  >
                    <Icon className={iconColor} size={16} />
                    {entry.name}
                  </button>
                : <div className='flex items-center gap-1.5'>
                    <Icon className={iconColor} size={16} />
                    <span>{entry.name}</span>
                  </div>
                }
              </td>
              <td
                className='text-base-content/60 text-sm'
                data-testid={entry.kind === 'file' ? T.FILE_SIZE : undefined}
              >
                {entry.kind === 'file' ? formatFileSize(entry.size || 0, locale) : '-'}
              </td>
              <td className='text-base-content/60 hidden text-sm md:table-cell'>
                {formatFileDate(entry.lastModified, locale)}
              </td>
              <td>
                <div className='flex items-center gap-1'>
                  {entry.kind === 'directory' ?
                    <>
                      <button
                        className='btn btn-ghost btn-xs'
                        onClick={event => {
                          event.stopPropagation();
                          onNavigate(entry);
                        }}
                        title={t('file.open')}
                      >
                        <FolderOpen size={14} />
                      </button>
                      <button
                        className='btn btn-ghost btn-xs'
                        onClick={event => {
                          event.stopPropagation();
                          onDownload(entry);
                        }}
                        title={t('file.downloadZip')}
                      >
                        <Download size={14} />
                      </button>
                    </>
                  : <>
                      {canPreviewFile(entry) && (
                        <button
                          className='btn btn-ghost btn-xs'
                          data-testid={T.PREVIEW_BTN}
                          onClick={event => {
                            event.stopPropagation();
                            onPreview(entry);
                          }}
                          title={t('file.preview')}
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      <button
                        className='btn btn-ghost btn-xs'
                        data-testid={T.DOWNLOAD_BTN}
                        onClick={event => {
                          event.stopPropagation();
                          onDownload(entry);
                        }}
                        title={t('file.download')}
                      >
                        <Download size={14} />
                      </button>
                    </>
                  }
                  <button
                    className='btn btn-ghost btn-xs'
                    data-testid='storage-rename-btn'
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
                    data-testid={entry.kind === 'file' ? T.DELETE_BTN : undefined}
                    onClick={event => {
                      event.stopPropagation();
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

import { formatFileSize, STORAGE_TESTID } from '@aiao/utils';
import { Download, Eye, FolderOpen, Trash2 } from 'lucide-react';
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
  onContextMenu: (event: React.MouseEvent, entry: StorageBrowserItem) => void;
  onEntryClick: (entry: StorageBrowserItem, event: React.MouseEvent) => void;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '-';

  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function StorageFileList({
  entries,
  selectedPaths,
  onNavigate,
  onDownload,
  onDelete,
  onPreview,
  onContextMenu,
  onEntryClick
}: Props) {
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
          <th>Name</th>
          <th className='w-32'>Size</th>
          <th className='w-40'>Modified</th>
          <th className='w-24'>Actions</th>
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
                {entry.kind === 'file' ? formatFileSize(entry.size || 0) : '-'}
              </td>
              <td className='text-base-content/60 text-sm'>{formatDate(entry.lastModified)}</td>
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
                        title='Open'
                      >
                        <FolderOpen size={14} />
                      </button>
                      <button
                        className='btn btn-ghost btn-xs'
                        onClick={event => {
                          event.stopPropagation();
                          onDownload(entry);
                        }}
                        title='Download ZIP'
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
                          title='Preview'
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
                        title='Download'
                      >
                        <Download size={14} />
                      </button>
                    </>
                  }
                  <button
                    className='btn btn-ghost btn-xs text-error'
                    data-testid={entry.kind === 'file' ? T.DELETE_BTN : undefined}
                    onClick={event => {
                      event.stopPropagation();
                      onDelete(entry);
                    }}
                    title='Delete'
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

import { useRxDB } from '@aiao/rxdb-react';
import { formatFileSize, STORAGE_TESTID } from '@aiao/utils';
import { Download, Eye, FolderOpen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useObjectUrlMap } from '../../../hooks/loadObjectUrlMap';
import { canPreviewFile, getFileIcon, getFileIconColor, isImageFile, StorageBrowserItem } from '../utils/storage-utils';

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

const getEntryPath = (entry: StorageBrowserItem) => entry.path;

export function StorageFileGrid({
  entries,
  selectedPaths,
  onNavigate,
  onDownload,
  onDelete,
  onPreview,
  onContextMenu,
  onEntryClick
}: Props) {
  const rxdb = useRxDB();
  const clickTimeoutRef = useRef<number | null>(null);
  const imageEntries = useMemo(
    () => entries.filter(entry => entry.kind === 'file' && entry.meta && isImageFile(entry)),
    [entries]
  );
  const loadThumbnail = useCallback(
    async (entry: StorageBrowserItem): Promise<string | null> => {
      if (!entry.meta) return null;
      return rxdb.storage.createObjectUrl(entry.meta.id);
    },
    [rxdb]
  );
  const revokeThumbnail = useCallback((url: string) => rxdb.storage.revokeObjectUrl(url), [rxdb]);
  const thumbnailUrls = useObjectUrlMap({
    items: imageEntries,
    getKey: getEntryPath,
    loadUrl: loadThumbnail,
    revokeUrl: revokeThumbnail
  });
  const T = STORAGE_TESTID;

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) window.clearTimeout(clickTimeoutRef.current);
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
    <div className='grid grid-cols-3 gap-3 p-3 select-none sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12'>
      {entries.map(entry => {
        const Icon = getFileIcon(entry);
        const iconColor = getFileIconColor(entry);
        const isSelected = selectedPaths.has(entry.path);

        return (
          <div
            key={entry.path}
            className={`group hover:bg-base-300 relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${isSelected ? 'bg-primary/20 ring-primary ring-2' : ''}`}
            data-entry-path={entry.path}
            onClick={event => handleEntryClick(entry, event)}
            onContextMenu={event => {
              event.preventDefault();
              onContextMenu(event, entry);
            }}
            onDoubleClick={() => handleDoubleClick(entry)}
            role='button'
            tabIndex={0}
          >
            <div className='flex h-16 w-full items-center justify-center'>
              {entry.kind === 'file' && isImageFile(entry) && thumbnailUrls.get(entry.path) ?
                <img
                  alt={entry.name}
                  className='h-full w-full rounded object-cover'
                  src={thumbnailUrls.get(entry.path)}
                />
              : <Icon className={iconColor} size={24} />}
            </div>

            <div className='w-full text-center'>
              <h2
                className='line-clamp-2 text-xs font-medium'
                data-testid={entry.kind === 'file' ? T.FILE_NAME : undefined}
                title={entry.name}
              >
                {entry.name}
              </h2>
              {entry.kind === 'file' && (
                <p className='text-base-content/60 text-[10px]' data-testid={T.FILE_SIZE}>
                  {formatFileSize(entry.size || 0)}
                </p>
              )}
            </div>

            <div className='absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'>
              {entry.kind === 'directory' ?
                <>
                  <button
                    className='btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur'
                    onClick={event => {
                      event.stopPropagation();
                      onNavigate(entry);
                    }}
                    title='Open'
                  >
                    <FolderOpen size={12} />
                  </button>
                  <button
                    className='btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur'
                    onClick={event => {
                      event.stopPropagation();
                      onDownload(entry);
                    }}
                    title='Download ZIP'
                  >
                    <Download size={12} />
                  </button>
                </>
              : <>
                  {canPreviewFile(entry) && (
                    <button
                      className='btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur'
                      data-testid={T.PREVIEW_BTN}
                      onClick={event => {
                        event.stopPropagation();
                        onPreview(entry);
                      }}
                      title='Preview'
                    >
                      <Eye size={12} />
                    </button>
                  )}
                  <button
                    className='btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur'
                    data-testid={T.DOWNLOAD_BTN}
                    onClick={event => {
                      event.stopPropagation();
                      onDownload(entry);
                    }}
                    title='Download'
                  >
                    <Download size={12} />
                  </button>
                </>
              }
              <button
                className='btn btn-circle btn-ghost btn-xs bg-base-100/80 text-error backdrop-blur'
                data-testid={entry.kind === 'file' ? T.DELETE_BTN : undefined}
                onClick={event => {
                  event.stopPropagation();
                  onDelete(entry);
                }}
                title='Delete'
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

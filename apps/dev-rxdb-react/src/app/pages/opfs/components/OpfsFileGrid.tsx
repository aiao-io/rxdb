/**
 * OPFS 文件网格组件
 */

import { Download, Eye, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useObjectUrlMap } from '../../../hooks/loadObjectUrlMap';
import { useOpfsService } from '../hooks/useOpfsService';
import {
  canPreviewFile,
  formatFileSize,
  getFileIcon,
  getFileIconColor,
  isImageFile,
  OPFSFileEntry
} from '../utils/opfs-utils';

interface Props {
  entries: OPFSFileEntry[];
  currentPath: string;
  selectedPaths: Set<string>;
  previewFile: ReturnType<typeof useOpfsService>['previewFile'];
  onNavigate: (entry: OPFSFileEntry) => void;
  onDownload: (entry: OPFSFileEntry) => void;
  onDelete: (entry: OPFSFileEntry) => void;
  onPreview: (entry: OPFSFileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry: OPFSFileEntry) => void;
  onEntryClick: (entry: OPFSFileEntry, event: React.MouseEvent) => void;
}

const getEntryPath = (entry: OPFSFileEntry) => entry.path;
const revokeObjectUrl = (url: string) => URL.revokeObjectURL(url);

export function OpfsFileGrid({
  entries,
  selectedPaths,
  previewFile,
  onNavigate,
  onDownload,
  onDelete,
  onPreview,
  onContextMenu,
  onEntryClick
}: Props) {
  const clickTimeoutRef = useRef<number | null>(null);
  const imageEntries = useMemo(() => entries.filter(isImageFile), [entries]);
  const loadThumbnail = useCallback(
    async (entry: OPFSFileEntry): Promise<string | null> => {
      const preview = await previewFile(entry);
      return preview?.data instanceof Blob ? URL.createObjectURL(preview.data) : null;
    },
    [previewFile]
  );
  const thumbnailUrls = useObjectUrlMap({
    items: imageEntries,
    getKey: getEntryPath,
    loadUrl: loadThumbnail,
    revokeUrl: revokeObjectUrl
  });

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) window.clearTimeout(clickTimeoutRef.current);
    };
  }, []);

  const handleEntryClick = useCallback(
    (entry: OPFSFileEntry, event: React.MouseEvent) => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = window.setTimeout(() => {
        onEntryClick(entry, event);
        clickTimeoutRef.current = null;
      }, 250);
    },
    [onEntryClick]
  );

  const handleDoubleClick = useCallback(
    (entry: OPFSFileEntry) => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      if (entry.kind === 'directory') onNavigate(entry);
      else onPreview(entry);
    },
    [onNavigate, onPreview]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, entry: OPFSFileEntry) => {
      event.preventDefault();
      onContextMenu(event, entry);
    },
    [onContextMenu]
  );

  return (
    <div className='grid grid-cols-3 gap-3 p-3 select-none sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12'>
      {entries.map(entry => {
        const Icon = getFileIcon(entry);
        const iconColor = getFileIconColor(entry);
        const isSelected = selectedPaths.has(entry.path);
        const thumbUrl = thumbnailUrls.get(entry.path);

        return (
          <div
            key={entry.path}
            className={`group hover:bg-base-300 relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${isSelected ? 'bg-primary/20 ring-primary ring-2' : ''}`}
            data-entry-path={entry.path}
            onClick={e => handleEntryClick(entry, e)}
            onContextMenu={e => handleContextMenu(e, entry)}
            onDoubleClick={() => handleDoubleClick(entry)}
            role='button'
            tabIndex={0}
          >
            <div className='flex h-16 w-full items-center justify-center'>
              {entry.kind === 'file' && isImageFile(entry) && thumbUrl ?
                <img className='h-full w-full rounded object-cover' alt={entry.name} src={thumbUrl} />
              : <Icon size={24} className={iconColor} />}
            </div>

            <div className='w-full text-center'>
              <h2 className='line-clamp-2 text-xs font-medium' title={entry.name}>
                {entry.name}
              </h2>
              {entry.kind === 'file' && (
                <p className='text-base-content/60 text-[10px]'>{formatFileSize(entry.size || 0)}</p>
              )}
            </div>

            <div className='absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'>
              {entry.kind === 'file' && canPreviewFile(entry) && (
                <button
                  className='btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur'
                  onClick={e => {
                    e.stopPropagation();
                    onPreview(entry);
                  }}
                  title='预览'
                >
                  <Eye size={12} />
                </button>
              )}
              {entry.kind === 'file' && (
                <button
                  className='btn btn-circle btn-ghost btn-xs bg-base-100/80 backdrop-blur'
                  onClick={e => {
                    e.stopPropagation();
                    onDownload(entry);
                  }}
                  title='下载'
                >
                  <Download size={12} />
                </button>
              )}
              <button
                className='btn btn-circle btn-ghost btn-xs bg-base-100/80 text-error backdrop-blur'
                onClick={e => {
                  e.stopPropagation();
                  onDelete(entry);
                }}
                title='删除'
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

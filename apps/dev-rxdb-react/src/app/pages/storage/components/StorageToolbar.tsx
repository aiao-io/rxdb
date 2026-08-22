import { STORAGE_LABELS, STORAGE_TESTID } from '@aiao/utils';
import {
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  Grid3x3,
  Home,
  List,
  RefreshCw,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { ViewMode } from '../types';

interface StorageToolbarProps {
  allFilesCount: number;
  currentPath: string;
  loading: boolean;
  opfsAvailable: boolean;
  selectionSize: number;
  viewMode: ViewMode;
  onBatchDelete: () => void;
  onBatchDownload: () => void;
  onClearAll: () => void;
  onClearSelection: () => void;
  onNavigate: (path: string) => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onUploadFolder: () => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export function StorageToolbar({
  allFilesCount,
  currentPath,
  loading,
  opfsAvailable,
  selectionSize,
  viewMode,
  onBatchDelete,
  onBatchDownload,
  onClearAll,
  onClearSelection,
  onNavigate,
  onNewFolder,
  onRefresh,
  onUpload,
  onUploadFolder,
  onViewModeChange
}: StorageToolbarProps): React.JSX.Element {
  const T = STORAGE_TESTID;
  const L = STORAGE_LABELS;
  const pathSegments = currentPath
    .split('/')
    .filter(Boolean)
    .map((segment, index, segments) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/')
    }));

  return (
    <>
      <div className='border-base-300 flex items-center justify-between border-b px-3 py-2'>
        <div className='flex items-center gap-3'>
          <span className='text-sm font-bold'>{L.PAGE_TITLE}</span>
          <div className='flex items-center gap-1.5'>
            <div className={`h-2 w-2 rounded-full ${opfsAvailable ? 'bg-success' : 'bg-error'}`} />
            <span className='text-base-content/60 text-xs'>{opfsAvailable ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div className='tabs tabs-boxed tabs-xs' role='tablist'>
          <button
            className={`tab gap-1 ${viewMode === 'list' ? 'tab-active' : ''}`}
            onClick={() => onViewModeChange('list')}
            role='tab'
          >
            <List size={12} /> List
          </button>
          <button
            className={`tab gap-1 ${viewMode === 'grid' ? 'tab-active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            role='tab'
          >
            <Grid3x3 size={12} /> Grid
          </button>
        </div>
      </div>

      <div className='border-base-300 flex items-center gap-2 border-b p-2'>
        <button className='btn btn-xs btn-ghost' onClick={() => onNavigate('/')} title='Root'>
          <Home size={16} />
        </button>
        <button className='btn btn-xs btn-ghost' onClick={onRefresh} title='Refresh'>
          <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
        </button>
        <div className='divider divider-horizontal m-0' />
        <button className='btn btn-xs btn-primary' data-testid={T.UPLOAD_BTN} onClick={onUpload}>
          <Upload size={16} /> {L.UPLOAD}
        </button>
        <button className='btn btn-xs btn-primary' data-testid={T.UPLOAD_FOLDER_BTN} onClick={onUploadFolder}>
          <Folder size={16} /> Upload Folder
        </button>
        <button className='btn btn-xs btn-secondary' data-testid={T.NEW_FOLDER_BTN} onClick={onNewFolder}>
          <FolderPlus size={16} /> New Folder
        </button>
        {selectionSize > 0 && (
          <>
            <div className='divider divider-horizontal m-0' />
            <span className='text-base-content/60 text-xs'>Selected {selectionSize} items</span>
            <button
              className='btn btn-xs btn-ghost'
              data-testid={T.CLEAR_SELECTION_BTN}
              onClick={onClearSelection}
              title='Clear selection'
            >
              <X size={14} />
            </button>
            <button
              className='btn btn-xs btn-info'
              data-testid={T.BATCH_DOWNLOAD_BTN}
              onClick={onBatchDownload}
              title='Batch download'
            >
              <Download size={16} /> Download
            </button>
            <button
              className='btn btn-xs btn-error'
              data-testid={T.BATCH_DELETE_BTN}
              onClick={onBatchDelete}
              title='Batch delete'
            >
              <Trash2 size={16} /> Delete
            </button>
          </>
        )}
        {currentPath === '/' && allFilesCount > 0 && (
          <>
            <div className='divider divider-horizontal m-0' />
            <button className='btn btn-xs btn-error btn-outline' data-testid={T.CLEAR_BTN} onClick={onClearAll}>
              <Trash2 size={16} /> {L.CLEAR_ALL}
            </button>
          </>
        )}
      </div>

      <div className='border-base-300 flex items-center gap-1 border-b px-3 py-2 text-sm'>
        <button className='hover:underline' onClick={() => onNavigate('/')}>
          Root
        </button>
        {pathSegments.map(segment => (
          <div key={segment.path} className='flex items-center gap-1'>
            <ChevronRight className='text-base-content/40' size={14} />
            <button className='hover:underline' onClick={() => onNavigate(segment.path)}>
              {segment.name}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

import { CodeEditor } from '@aiao/code-editor-react';
import { useRxDB } from '@aiao/rxdb-react';
import { STORAGE_TESTID } from '@aiao/utils';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCodeLanguage, getFileType, isTextBlob, StorageBrowserItem } from '../utils/storage-utils';

interface Props {
  entry: StorageBrowserItem | null;
  onClose: () => void;
}

export function StorageFilePreview({ entry, onClose }: Props) {
  const rxdb = useRxDB();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [content, setContent] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('');
  const [fileType, setFileType] = useState<'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown'>('unknown');
  const [codeLanguage, setCodeLanguage] = useState('javascript');
  const currentEntryPathRef = useRef<string | null>(null);
  const loadingEntryPathRef = useRef<string | null>(null);
  const T = STORAGE_TESTID;

  const cleanupContentUrl = useCallback(() => {
    setContent(previousContent => {
      if (previousContent && previousContent.startsWith('blob:')) {
        URL.revokeObjectURL(previousContent);
      }

      return null;
    });
  }, []);

  const resetPreviewState = useCallback(() => {
    cleanupContentUrl();
    setLoading(false);
    setLoadError('');
    setTextContent('');
    setFileType('unknown');
  }, [cleanupContentUrl]);

  const loadFileContent = useCallback(
    async (currentEntry: StorageBrowserItem): Promise<void> => {
      if (!currentEntry.meta) {
        return;
      }

      const entryPath = currentEntry.path;
      loadingEntryPathRef.current = entryPath;
      setLoading(true);
      setLoadError('');
      cleanupContentUrl();
      setTextContent('');
      setFileType('unknown');

      try {
        const blob = await rxdb.storage.read(currentEntry.meta.id);

        if (currentEntryPathRef.current !== entryPath) return;

        let type = getFileType(currentEntry);
        if (type === 'unknown' && (await isTextBlob(blob))) type = 'text';
        if (currentEntryPathRef.current !== entryPath) return;

        setFileType(type);

        if (type === 'code' || type === 'text') {
          const text = await blob.text();
          if (currentEntryPathRef.current !== entryPath) return;
          setTextContent(text);
          if (type === 'code') setCodeLanguage(getCodeLanguage(currentEntry.name));
        } else if (type === 'image' || type === 'audio' || type === 'video') {
          const url = URL.createObjectURL(blob);
          if (currentEntryPathRef.current !== entryPath) {
            URL.revokeObjectURL(url);
            return;
          }
          setContent(url);
        }
      } catch (error) {
        if (currentEntryPathRef.current === entryPath) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (loadingEntryPathRef.current === entryPath) {
          setLoading(false);
          loadingEntryPathRef.current = null;
        }
      }
    },
    [cleanupContentUrl, rxdb]
  );

  useEffect(() => {
    const entryPath = entry?.path || null;
    if (entryPath === currentEntryPathRef.current) return;
    currentEntryPathRef.current = entryPath;

    if (!entry || entry.kind === 'directory' || !entry.meta) {
      loadingEntryPathRef.current = null;
      const resetTimeout = window.setTimeout(resetPreviewState, 0);
      return () => window.clearTimeout(resetTimeout);
    }

    if (loadingEntryPathRef.current === entryPath) {
      return undefined;
    }

    void loadFileContent(entry);
    return undefined;
  }, [entry, loadFileContent, resetPreviewState]);

  useEffect(() => {
    return () => {
      cleanupContentUrl();
    };
  }, [cleanupContentUrl]);

  const handleClose = useCallback(() => {
    resetPreviewState();
    onClose();
  }, [onClose, resetPreviewState]);

  if (!entry || entry.kind === 'directory' || !entry.meta) {
    return null;
  }

  return (
    <div
      className='modal modal-open'
      data-testid={T.PREVIEW_MODAL}
      onClick={handleClose}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          handleClose();
        }
      }}
      role='button'
      tabIndex={0}
    >
      <div className='modal-box flex h-[80vh] max-w-4xl flex-col' onClick={event => event.stopPropagation()}>
        <div className='mb-4 flex items-center justify-between'>
          <h3 className='text-lg font-bold'>{entry.name}</h3>
          <button
            className='btn btn-circle btn-ghost btn-sm'
            data-testid={T.PREVIEW_CLOSE}
            onClick={handleClose}
            type='button'
          >
            <X size={16} />
          </button>
        </div>

        <div className='flex flex-1 flex-col overflow-auto'>
          {loading ?
            <div className='flex h-full items-center justify-center'>
              <span className='loading loading-spinner loading-lg' />
            </div>
          : loadError ?
            <div className='text-base-content/40 py-8 text-center'>{loadError}</div>
          : <>
              {fileType === 'image' && content && (
                <div className='overflow-auto p-4'>
                  <img alt={entry.name} className='w-full' src={content} />
                </div>
              )}
              {fileType === 'audio' && content && (
                <div className='flex items-center justify-center p-4'>
                  <audio className='w-full max-w-xl' controls src={content}>
                    Audio preview is not supported
                  </audio>
                </div>
              )}
              {fileType === 'video' && content && (
                <div className='flex h-full items-center justify-center p-4'>
                  <video className='max-h-full max-w-full' controls src={content}>
                    Video preview is not supported
                  </video>
                </div>
              )}
              {fileType === 'code' && textContent && (
                <div className='h-full overflow-auto'>
                  <CodeEditor
                    language={codeLanguage}
                    lineWrapping={false}
                    readonly={true}
                    theme='dark'
                    value={textContent}
                  />
                </div>
              )}
              {fileType === 'text' && textContent && (
                <pre className='bg-base-200 overflow-auto rounded p-4 text-xs'>{textContent}</pre>
              )}
              {fileType === 'unknown' && !content && !textContent && (
                <div className='text-base-content/40 py-8 text-center'>Unable to preview this file</div>
              )}
            </>
          }
        </div>

        <div className='modal-action'>
          <button className='btn btn-sm' onClick={handleClose} type='button'>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

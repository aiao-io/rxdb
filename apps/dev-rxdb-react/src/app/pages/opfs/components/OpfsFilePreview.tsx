/**
 * OPFS 文件预览组件
 */

import { CodeEditor } from '@aiao/code-editor-react';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOpfsService } from '../hooks/useOpfsService';
import { getCodeLanguage, getFileType, isTextFile, OPFSFileEntry } from '../utils/opfs-utils';

interface Props {
  entry: OPFSFileEntry | null;
  previewFile: ReturnType<typeof useOpfsService>['previewFile'];
  onClose: () => void;
}

export function OpfsFilePreview({ entry, previewFile, onClose }: Props) {
  if (!entry || entry.kind === 'directory') {
    return null;
  }

  return <OpfsFilePreviewContent key={entry.path} entry={entry} previewFile={previewFile} onClose={onClose} />;
}

interface OpfsFilePreviewContentProps {
  entry: OPFSFileEntry;
  previewFile: Props['previewFile'];
  onClose: () => void;
}

function OpfsFilePreviewContent({ entry, previewFile, onClose }: OpfsFilePreviewContentProps) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('');
  const [fileType, setFileType] = useState<'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown'>('unknown');
  const [codeLanguage, setCodeLanguage] = useState('javascript');
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      revokeObjectUrl();
      setLoading(true);
      setContent(null);
      setTextContent('');
      setFileType('unknown');

      try {
        const preview = await previewFile(entry);
        if (!active || !preview) return;

        let type = getFileType(entry);

        if (preview.data instanceof Blob) {
          if (type === 'unknown') {
            const file = new File([preview.data], entry.name);
            const isText = await isTextFile(file);
            if (!active) return;
            if (isText) type = 'text';
          }

          setFileType(type);

          if (type === 'code' || type === 'text') {
            const text = await preview.data.text();
            if (!active) return;
            setTextContent(text);
            if (type === 'code') setCodeLanguage(getCodeLanguage(entry.name));
          } else if (type === 'image' || type === 'audio' || type === 'video') {
            const nextUrl = URL.createObjectURL(preview.data);
            objectUrlRef.current = nextUrl;
            setContent(nextUrl);
          }
        } else if (typeof preview.data === 'string') {
          setFileType(type);
          if (type === 'code' || type === 'text') {
            setTextContent(preview.data);
            if (type === 'code') setCodeLanguage(getCodeLanguage(entry.name));
          } else {
            setContent(preview.data);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      revokeObjectUrl();
    };
  }, [entry, previewFile, revokeObjectUrl]);

  const handleClose = useCallback(() => {
    revokeObjectUrl();
    onClose();
  }, [onClose, revokeObjectUrl]);

  useEffect(() => {
    return () => {
      revokeObjectUrl();
    };
  }, [revokeObjectUrl]);

  return (
    <div className='modal modal-open' onClick={handleClose}>
      <div className='modal-box flex h-[80vh] max-w-4xl flex-col' onClick={e => e.stopPropagation()}>
        <div className='mb-4 flex items-center justify-between'>
          <h3 className='text-lg font-bold'>{entry.name}</h3>
          <button className='btn btn-sm btn-circle btn-ghost' onClick={handleClose} type='button'>
            <X size={16} />
          </button>
        </div>

        <div className='flex flex-1 flex-col overflow-auto'>
          {loading ?
            <div className='flex h-full items-center justify-center'>
              <span className='loading loading-spinner loading-lg' />
            </div>
          : <>
              {fileType === 'image' && content && (
                <div className='overflow-auto p-4'>
                  <img className='w-full' alt={entry.name} src={content} />
                </div>
              )}
              {fileType === 'audio' && content && (
                <div className='flex items-center justify-center p-4'>
                  <audio className='w-full max-w-xl' src={content} controls>
                    您的浏览器不支持音频播放
                  </audio>
                </div>
              )}
              {fileType === 'video' && content && (
                <div className='flex h-full items-center justify-center p-4'>
                  <video className='max-h-full max-w-full' src={content} controls>
                    您的浏览器不支持视频播放
                  </video>
                </div>
              )}
              {fileType === 'code' && textContent && (
                <div className='h-full overflow-auto'>
                  <CodeEditor
                    value={textContent}
                    language={codeLanguage}
                    lineWrapping={false}
                    readonly={true}
                    theme='dark'
                  />
                </div>
              )}
              {fileType === 'text' && textContent && (
                <pre className='bg-base-200 overflow-auto rounded p-4 text-xs'>{textContent}</pre>
              )}
              {fileType === 'unknown' && !content && !textContent && (
                <div className='text-base-content/40 py-8 text-center'>无法预览此文件</div>
              )}
            </>
          }
        </div>

        <div className='modal-action'>
          <button className='btn btn-sm' onClick={handleClose} type='button'>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

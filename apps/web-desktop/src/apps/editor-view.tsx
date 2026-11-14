import { useCallback, useEffect, useRef, useState } from 'react';
import { isRecord } from '../core/catalog.js';
import { errorMessage, requireCondition } from '../core/errors.js';
import { getRelease } from '../core/releases.js';
import type { VirtualFile } from '../core/types.js';
import { documentRoute, parseEditorRoute } from './editor-navigation.js';
import { EditorDocument } from './editor.js';
import type { AppSession } from './session.js';

export function EditorView({ session }: { session: AppSession }) {
  const canCopy = getRelease(
    session.client.context.appId,
    session.client.context.version
  ).definition.capabilities.includes('clipboard');
  const [initialFileId] = useState(
    () => parseEditorRoute(session.navigation.state.route).fileId ?? session.client.context.props['fileId']
  );
  const [loaded, setLoaded] = useState(typeof initialFileId !== 'string');
  const [doc] = useState(() => new EditorDocument());
  const [, render] = useState(0);
  const [message, setMessage] = useState('UTF-8 · 纯文本');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => session.bindSuspension(() => loaded && !doc.dirty && !busy && !saving.current),
    [session, doc, loaded, busy]
  );
  const redraw = useCallback(() => {
    render(value => value + 1);
  }, []);
  const sync = useCallback(
    async (route?: string) => {
      await session.update({
        title: `${doc.name}${doc.dirty ? ' · 未保存' : ''}`,
        dirty: doc.dirty,
        fileId: doc.fileId,
        ...(route === undefined ? {} : { route }),
        commands: [
          { id: 'save', label: '保存', disabled: false },
          { id: 'saveAs', label: '另存为', disabled: false },
          { id: 'undo', label: '撤销', disabled: !doc.canUndo },
          { id: 'redo', label: '重做', disabled: !doc.canRedo }
        ]
      });
    },
    [doc, session]
  );
  const load = useCallback(
    async (id: string, options: { signal?: AbortSignal; route?: string; track?: boolean } = {}): Promise<boolean> => {
      setBusy(true);
      setError('');
      try {
        await doc.open(() => session.request<VirtualFile>('files.read', { id }), options.signal);
        if (options.track !== false && parseEditorRoute(session.navigation.state.route).fileId !== id)
          session.navigation.record(documentRoute(id), true);
        setLoaded(true);
        redraw();
        await sync(options.route ?? session.navigation.state.route);
        setMessage('已打开 · UTF-8');
        return true;
      } catch (error) {
        setError(errorMessage(error));
        if (options.track === false) throw error;
        return false;
      } finally {
        setBusy(false);
      }
    },
    [doc, session, redraw, sync]
  );
  const save = useCallback(
    async (saveAs = false): Promise<boolean> => {
      if (saving.current || !loaded) return false;
      saving.current = true;
      setBusy(true);
      setError('');
      try {
        const destination =
          saveAs || !doc.fileId ?
            await session.request<{ name: string; parentId: string | null } | null>('desktop.saveFile', {
              name: doc.name,
              parentId: doc.parentId
            })
          : undefined;
        if (destination === null) return false;
        await doc.save(
          snapshot =>
            snapshot.fileId ?
              session.request<VirtualFile>('files.write', {
                id: snapshot.fileId,
                revision: snapshot.revision,
                bytes: snapshot.bytes,
                name: snapshot.name
              })
            : session.request<VirtualFile>('files.create', {
                name: snapshot.name,
                parentId: snapshot.parentId,
                bytes: snapshot.bytes,
                mime: snapshot.name.endsWith('.md') ? 'text/markdown' : 'text/plain'
              }),
          saveAs,
          destination
        );
        if (doc.fileId && parseEditorRoute(session.navigation.state.route).fileId !== doc.fileId)
          session.navigation.record(documentRoute(doc.fileId), true);
        setMessage('已保存 · UTF-8');
        redraw();
        await sync(session.navigation.state.route);
        return true;
      } catch (error) {
        setError(errorMessage(error));
        return false;
      } finally {
        saving.current = false;
        setBusy(false);
      }
    },
    [doc, session, redraw, sync, loaded]
  );
  useEffect(
    () =>
      session.navigation.bind(async (route, signal) => {
        const location = parseEditorRoute(route);
        requireCondition(loaded && !busy && !saving.current, 'BUSY', '请先完成当前文档操作');
        if (location.fileId !== null && location.fileId !== doc.fileId) {
          requireCondition(!doc.dirty, 'DIRTY', '文档有未保存内容，请先保存后再打开其他位置');
          await load(location.fileId, { signal, route, track: false });
        }
      }),
    [session, doc, loaded, busy, load]
  );
  const positionRoute = session.navigation.state.route;
  const line = parseEditorRoute(positionRoute).line;
  useEffect(() => {
    if (!loaded) return;
    const frame = requestAnimationFrame(() => {
      const offset = Math.min(
        doc.text.length,
        doc.text
          .split('\n')
          .slice(0, line - 1)
          .reduce((total, text) => total + text.length + 1, 0)
      );
      editor.current?.setSelectionRange(offset, offset);
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded, line, doc, positionRoute]);
  useEffect(() => {
    const client = session.client;
    const invalidated = (value: unknown) => {
      const reason = isRecord(value) ? value['reason'] : '';
      setError(
        reason === 'trashed' ? '文件已移入回收站，请恢复或另存为。当前编辑内容仍保留。'
        : reason === 'missing' ? '文件已永久删除。请另存为保留当前内容。'
        : '文件已由其他窗口更改。保存时会检查版本；可重新加载或另存为。'
      );
    };
    const offInvalidated = session.onEvent('document.invalidated', invalidated);
    const cleanups = [
      client.onRequest('document.prepareClose', () => ({ dirty: doc.dirty })),
      client.onRequest('document.save', () => save()),
      client.onRequest('document.discard', async () => {
        doc.discard();
        redraw();
        await sync();
        return true;
      }),
      client.onRequest('command', async payload => {
        const id = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload['id'] : null;
        if (id === 'save' || id === 'saveAs') return save(id === 'saveAs');
        if (id === 'undo') doc.undo();
        if (id === 'redo') doc.redo();
        redraw();
        await sync();
        return true;
      })
    ];
    return () => {
      offInvalidated();
      for (const cleanup of cleanups) cleanup();
    };
  }, [session, doc, save, load, sync, redraw]);
  useEffect(() => {
    if (typeof initialFileId === 'string') void Promise.resolve().then(() => load(initialFileId));
    else {
      void sync();
      editor.current?.focus();
    }
  }, [initialFileId, load, sync]);
  return (
    <main className='editor-app app-layout'>
      <header className='app-toolbar'>
        <label className='filename-label'>
          <span className='sr-only'>文件名</span>
          <input
            disabled={!loaded}
            aria-label='文件名'
            value={doc.name}
            onChange={event => {
              doc.rename(event.target.value);
              redraw();
              void sync().catch(error => setError(errorMessage(error)));
            }}
          />
        </label>
        <span className='toolbar-spacer' />
        <button
          disabled={busy || !loaded}
          className='primary'
          onClick={() => {
            void save();
          }}
        >
          保存
        </button>
        <button
          disabled={busy || !loaded}
          onClick={() => {
            void save(true);
          }}
        >
          另存为
        </button>
      </header>
      <div className='editor-subbar'>
        {canCopy && (
          <button
            disabled={!loaded}
            onClick={() => {
              setError('');
              void session
                .request('clipboard.write', { text: doc.text })
                .then(() => setMessage('已复制全文'))
                .catch(error => setError(`${errorMessage(error)}。可选择文档内容后手动复制。`));
            }}
          >
            复制全文
          </button>
        )}
        <span>浏览器内桌面存储 / {doc.parentId === null ? '我的文件' : '当前目录'}</span>
        <div>
          <button
            aria-label='撤销'
            disabled={!doc.canUndo}
            onClick={() => {
              doc.undo();
              redraw();
              void sync();
            }}
          >
            ↶
          </button>
          <button
            aria-label='重做'
            disabled={!doc.canRedo}
            onClick={() => {
              doc.redo();
              redraw();
              void sync();
            }}
          >
            ↷
          </button>
        </div>
      </div>
      {error && (
        <div className='app-error' role='alert'>
          <span>{error}</span>
          {(doc.fileId || typeof initialFileId === 'string') && (
            <button
              onClick={async () => {
                if (await session.confirm('重新加载文件', '将放弃当前未保存内容，读取最新保存版本。'))
                  await load(doc.fileId ?? String(initialFileId));
              }}
            >
              重新加载
            </button>
          )}
          <button
            onClick={() => {
              void save(true);
            }}
          >
            另存为新文件
          </button>
        </div>
      )}
      <textarea
        ref={editor}
        disabled={!loaded}
        aria-busy={!loaded}
        aria-label='文档内容'
        className='document-editor'
        spellCheck={false}
        value={doc.text}
        onChange={event => {
          doc.edit(event.target.value);
          redraw();
          void sync().catch(error => setError(errorMessage(error)));
        }}
        onKeyDown={event => {
          if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save(event.shiftKey);
          }
        }}
      />
      <footer className='app-status' role='status'>
        <span>
          {busy ?
            '正在处理…'
          : doc.dirty ?
            '未保存的更改'
          : message}
        </span>
        <span>
          {doc.text.length} 字符 · {doc.text.split('\n').length} 行
        </span>
      </footer>
    </main>
  );
}

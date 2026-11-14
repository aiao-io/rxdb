import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { decodeBytes, encodeBytes } from '../core/bytes.js';
import { errorMessage, requireCondition } from '../core/errors.js';
import { MAX_FILE_BYTES, MAX_IMPORT_BYTES, MAX_IMPORT_COUNT } from '../core/files.js';
import type { VirtualFile } from '../core/types.js';
import { FileIcon, SymbolIcon } from '../ui/icons.js';
import { directoryTrail, filesRoute, parseFilesRoute } from './files-navigation.js';
import { download, type AppSession } from './session.js';

type FileItem = VirtualFile & { size: number };

function fileType(file: VirtualFile): string {
  if (file.kind === 'directory') return '文件夹';
  const types: Record<string, string> = {
    'text/plain': '文本文档',
    'text/markdown': 'Markdown 文档',
    'application/json': 'JSON 文件',
    'application/pdf': 'PDF 文档',
    'image/png': 'PNG 图像',
    'image/jpeg': 'JPEG 图像'
  };
  const extension = file.name.includes('.') ? file.name.split('.').at(-1)!.toUpperCase() : '';
  return types[file.mime] ?? `${extension} 文件`.trim();
}

function fileSize(size: number): string {
  const units = [
    { unit: 'megabyte', divisor: 1048576 },
    { unit: 'kilobyte', divisor: 1024 },
    { unit: 'byte', divisor: 1 }
  ];
  const format = units.find(({ divisor }) => size >= divisor) ?? units[2];
  return new Intl.NumberFormat('zh-CN', { style: 'unit', unit: format.unit, maximumFractionDigits: 1 }).format(
    size / format.divisor
  );
}

function directoryName(directories: readonly VirtualFile[], parentId: string | null, trash: boolean): string {
  if (trash) return '回收站';
  if (parentId === null) return '我的文件';
  return directories.find(dir => dir.id === parentId)?.name ?? '目录不可用';
}
export function FilesView({ session }: { session: AppSession }) {
  const importInput = useRef<HTMLInputElement>(null);
  const requests = useRef(0);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [entries, setEntries] = useState<FileItem[]>([]);
  const [directories, setDirectories] = useState<VirtualFile[]>([]);
  const [initialLocation] = useState(() => parseFilesRoute(session.navigation.state.route));
  const [folder, setFolder] = useState({ parentId: initialLocation.parentId, trash: initialLocation.trash });
  const { parentId, trash } = folder;
  const [search, setSearch] = useState(initialLocation.search);
  const [selected, setSelected] = useState<string | null>(initialLocation.selected);
  const [creating, setCreating] = useState<'file' | 'directory' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => session.bindSuspension(() => !busy && creating === null), [session, busy, creating]);
  const selectedFile = entries.find(file => file.id === selected);
  const location = directoryName(directories, parentId, trash);
  const trail = directoryTrail(directories, parentId);
  const refresh = useCallback(async () => {
    const { parentId, search, trash } = parseFilesRoute(session.navigation.state.route);
    const revision = ++requests.current;
    setBusy(true);
    setError('');
    try {
      const [files, dirs] = await Promise.all([
        session.request<FileItem[]>('files.list', { parentId, search, trash }),
        session.request<VirtualFile[]>('files.directories')
      ]);
      if (revision !== requests.current) return;
      setEntries(
        files.toSorted(
          (a, b) =>
            Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
            a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
        )
      );
      setDirectories(dirs);
      await session.update({ title: `文件 · ${directoryName(dirs, parentId, trash)}`, dirty: false });
    } catch (error) {
      if (revision === requests.current) setError(errorMessage(error));
    } finally {
      if (revision === requests.current) setBusy(false);
    }
  }, [session]);
  useEffect(() => {
    const changed = () => {
      void refresh();
    };
    const offChanged = session.onEvent('files.changed', changed);
    const cleanups = [
      session.client.onRequest('document.prepareClose', () => ({ dirty: false })),
      session.client.onRequest('document.save', () => true)
    ];
    return () => {
      offChanged();
      for (const cleanup of cleanups) cleanup();
    };
  }, [session, refresh]);
  const invalidate = useCallback(() => {
    requests.current++;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
      invalidate();
    };
  }, [refresh, folder, search, invalidate]);
  const applyRoute = useCallback((route: string) => {
    const location = parseFilesRoute(route);
    requests.current++;
    setBusy(true);
    setEntries([]);
    setFolder({ parentId: location.parentId, trash: location.trash });
    setSearch(location.search);
    setSelected(location.selected);
    setCreating(null);
  }, []);
  useEffect(() => session.navigation.bind(applyRoute), [session, applyRoute]);
  function navigate(id: string | null, toTrash = false) {
    const route = filesRoute({ parentId: id, trash: toTrash, search: '', selected: null });
    applyRoute(route);
    session.navigation.record(route);
  }

  function selection(): FileItem {
    requireCondition(selectedFile, 'INVALID', '请先选择一个文件');
    return selectedFile;
  }
  async function perform(action: () => Promise<unknown>, success = '') {
    setError('');
    setBusy(true);
    try {
      await action();
      if (success) setMessage(success);
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function open(file: FileItem) {
    if (file.kind === 'directory') {
      navigate(file.id);
      return;
    }
    await perform(() => session.request('files.open', { id: file.id }));
  }
  async function prompt(title: string, label: string, value: string): Promise<string | null> {
    return session.request('desktop.prompt', { title, label, value });
  }
  async function importSelection(files: FileList | null) {
    if (!files?.length) return;
    await perform(async () => {
      const selected = Array.from(files);
      requireCondition(
        selected.length <= MAX_IMPORT_COUNT &&
          selected.every(file => file.size <= MAX_FILE_BYTES) &&
          selected.reduce((size, file) => size + file.size, 0) <= MAX_IMPORT_BYTES,
        'LIMIT',
        '单文件最多 50 MiB，每批最多 100 个文件、200 MiB'
      );
      const inputs = await Promise.all(
        selected.map(async file => ({
          name: file.name,
          parentId,
          mime: file.type || 'application/octet-stream',
          bytes: encodeBytes(new Uint8Array(await file.arrayBuffer()))
        }))
      );
      await session.request('files.import', { files: inputs });
    }, `已处理 ${files.length} 个文件。它们与本机文件相互独立。`);
  }
  function fileButton(file: FileItem) {
    return (
      <button
        aria-label={`打开 ${file.name}`}
        onClick={() => {
          setSelected(file.id);
          session.navigation.record(filesRoute({ parentId, trash, search, selected: file.id }), true);
        }}
        onDoubleClick={() => {
          if (!trash) void open(file);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !trash) {
            event.preventDefault();
            void open(file);
          }
        }}
      >
        <FileIcon kind={file.kind} />
        <span className='file-name'>{file.name}</span>
      </button>
    );
  }
  return (
    <main className='files-app app-layout'>
      <header className='app-toolbar'>
        <nav className='file-breadcrumbs' aria-label='文件路径'>
          <button
            aria-label='返回我的文件'
            aria-current={!trash && parentId === null ? 'page' : undefined}
            onClick={() => navigate(null)}
          >
            我的文件
          </button>
          {trash ?
            <>
              <span aria-hidden='true'>›</span>
              <span aria-current='page'>回收站</span>
            </>
          : trail?.map(directory => (
              <Fragment key={directory.id}>
                <span aria-hidden='true'>›</span>
                <button
                  aria-current={directory.id === parentId ? 'page' : undefined}
                  onClick={() => navigate(directory.id)}
                >
                  {directory.name}
                </button>
              </Fragment>
            ))
          }
          {!trash && trail === null && <span role='status'>当前目录不可用，请返回我的文件。</span>}
        </nav>
        <span className='toolbar-spacer' />
        <div className='file-view-controls' aria-label='显示方式'>
          <button aria-label='图标视图' title='图标视图' aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
            <SymbolIcon name='grid' />
          </button>
          <button aria-label='列表视图' title='列表视图' aria-pressed={view === 'list'} onClick={() => setView('list')}>
            <SymbolIcon name='list' />
          </button>
        </div>
        <button
          className='file-refresh'
          aria-label='刷新文件'
          title='刷新文件'
          disabled={busy}
          onClick={() => {
            void refresh();
          }}
        >
          <SymbolIcon name='refresh' />
        </button>
        <label className='file-search'>
          <SymbolIcon name='search' />
          <input
            aria-label='搜索当前目录'
            placeholder='搜索当前目录'
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              session.navigation.record(filesRoute({ parentId, trash, search: event.target.value, selected }), true);
            }}
          />
        </label>
      </header>
      <div className='file-body'>
        <aside className='app-sidebar'>
          <span className='sidebar-label'>个人收藏</span>
          <button aria-pressed={!trash && parentId === null} onClick={() => navigate(null)}>
            <SymbolIcon name='drive' /> 我的文件
          </button>
          <button aria-pressed={trash} onClick={() => navigate(null, true)}>
            <SymbolIcon name='trash' /> 回收站
          </button>
          <span className='sidebar-label'>目录</span>
          {directories.map(dir => (
            <button
              key={dir.id}
              aria-pressed={!trash && parentId === dir.id}
              title={directoryTrail(directories, dir.id)
                ?.map(item => item.name)
                .join(' / ')}
              style={{ paddingLeft: 10 + 12 * Math.max(0, (directoryTrail(directories, dir.id)?.length ?? 1) - 1) }}
              onClick={() => navigate(dir.id)}
            >
              <SymbolIcon name='folder' /> {dir.name}
            </button>
          ))}
          <p>
            保存在此浏览器，
            <br />
            不等同于本机磁盘。
          </p>
        </aside>
        <section
          className='file-content'
          aria-label={location}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            if (!trash && !busy) void importSelection(event.dataTransfer.files);
          }}
        >
          <div className='file-actions'>
            {!trash && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    setCreating('file');
                    setName('新文档.txt');
                  }}
                >
                  <SymbolIcon name='file' /> 新建文件
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setCreating('directory');
                    setName('新建文件夹');
                  }}
                >
                  <SymbolIcon name='folder' /> 新建文件夹
                </button>
                <div>
                  <button disabled={busy} onClick={() => importInput.current?.click()}>
                    <SymbolIcon name='upload' /> 导入文件
                  </button>
                  <input
                    ref={importInput}
                    aria-label='导入本机文件'
                    type='file'
                    multiple
                    hidden
                    onChange={event => {
                      void importSelection(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>
              </>
            )}
            {!trash && selectedFile && (
              <>
                <>
                  <button
                    disabled={busy || selectedFile?.kind !== 'file'}
                    onClick={() => {
                      void perform(() => session.request('files.open', { id: selection().id, choose: true }));
                    }}
                  >
                    打开方式
                  </button>
                  <button
                    disabled={busy || selectedFile?.kind !== 'file'}
                    onClick={() => {
                      void perform(() => session.request('files.open', { id: selection().id, newInstance: true }));
                    }}
                  >
                    在新窗口打开
                  </button>
                </>

                <button
                  disabled={busy || !selectedFile}
                  onClick={() => {
                    void perform(async () => {
                      const name = await prompt('重命名', '名称', selection().name);
                      if (name !== null) await session.request('files.rename', { id: selection().id, name });
                    });
                  }}
                >
                  重命名
                </button>
                <button
                  disabled={busy || !selectedFile}
                  onClick={() => {
                    void perform(async () => {
                      const target = await session.request<string | null>('desktop.selectDirectory', {
                        title: '移动到',
                        value: parentId
                      });
                      if (target !== null)
                        await session.request('files.move', {
                          id: selection().id,
                          parentId: target === 'root' ? null : target
                        });
                    });
                  }}
                >
                  移动到
                </button>
                <button
                  disabled={busy || !selectedFile}
                  onClick={() => {
                    void perform(() => session.request('files.trash', { id: selection().id }), '已移入回收站');
                  }}
                >
                  移到回收站
                </button>
              </>
            )}
            {!trash && selectedFile && (
              <button
                disabled={busy || selectedFile?.kind !== 'file'}
                onClick={() => {
                  void perform(async () => {
                    const file = await session.request<VirtualFile>('files.read', { id: selection().id });
                    download(file.name, decodeBytes(file.bytes), file.mime);
                  }, '已交付浏览器下载，请检查下载位置');
                }}
              >
                下载导出
              </button>
            )}
            {trash && entries.length > 0 && (
              <button
                disabled={busy}
                className='danger'
                onClick={() => {
                  void perform(() => session.request('files.emptyTrash'), '回收站已清空');
                }}
              >
                清空回收站
              </button>
            )}
            {selectedFile && trash && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    void perform(() => session.request('files.restore', { id: selectedFile.id }), '文件已恢复');
                  }}
                >
                  恢复
                </button>
                <button
                  className='danger'
                  disabled={busy}
                  onClick={() => {
                    void perform(async () => {
                      if (await session.confirm('永久删除 1 项', '文件字节及元数据将永久删除，无法恢复。'))
                        await session.request('files.delete', { id: selectedFile.id });
                    });
                  }}
                >
                  永久删除
                </button>
              </>
            )}
          </div>
          {creating && (
            <form
              className='file-create'
              onSubmit={event => {
                event.preventDefault();
                void perform(async () => {
                  await session.request('files.create', {
                    name,
                    parentId,
                    kind: creating,
                    bytes: '',
                    mime: name.endsWith('.md') ? 'text/markdown' : 'text/plain'
                  });
                  setCreating(null);
                });
              }}
            >
              <label>
                名称
                <input aria-label='新建名称' value={name} onChange={event => setName(event.target.value)} required />
              </label>
              <button type='submit' className='primary'>
                创建
              </button>
              <button type='button' onClick={() => setCreating(null)}>
                取消
              </button>
            </form>
          )}
          {error && (
            <div className='app-error' role='alert'>
              <span>{error}</span>
              <button
                onClick={() => {
                  setError('');
                  void refresh();
                }}
              >
                重试
              </button>
            </div>
          )}
          {!entries.length && !busy && (
            <div className='file-empty'>
              <SymbolIcon name={trash ? 'trash' : 'folder'} />
              <h2>
                {search ?
                  '没有找到文件'
                : trash ?
                  '回收站是空的'
                : '此文件夹为空'}
              </h2>
              <p>
                {search ?
                  '尝试其他名称，搜索仅限当前目录。'
                : trash ?
                  '删除的文件会先保留在这里。'
                : '新建一份文档，或从本机导入文件。'}
              </p>
            </div>
          )}
          {entries.length > 0 && view === 'list' && (
            <table className='file-table'>
              <thead>
                <tr>
                  <th scope='col'>名称</th>
                  <th scope='col'>类型</th>
                  <th scope='col'>大小</th>
                  <th scope='col'>修改时间</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(file => (
                  <tr key={file.id} data-selected={selected === file.id}>
                    <td>{fileButton(file)}</td>
                    <td>{fileType(file)}</td>
                    <td>{file.kind === 'directory' ? '—' : fileSize(file.size)}</td>
                    <td>
                      {new Date(file.modified).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {entries.length > 0 && view === 'grid' && (
            <div className='file-grid'>
              {entries.map(file => (
                <div className='file-tile' key={file.id} data-selected={selected === file.id}>
                  {fileButton(file)}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className='app-status' role='status'>
        <span>{busy ? '正在读取…' : message || `${entries.length} 个项目`}</span>
        <span>{selectedFile ? `已选择 ${selectedFile.name}` : '本地存储'}</span>
      </footer>
    </main>
  );
}

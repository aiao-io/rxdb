import {
  StorageFetchError,
  StorageFileMeta,
  StorageMimeTypeMissingError,
  StorageOfflineError
} from '@aiao/rxdb-plugin-storage';
import { useRxDB } from '@aiao/rxdb-react';
import { formatFileSize } from '@aiao/utils';
import { Cloud, CloudDownload, File, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isImageMimeType } from './remote-cache-preview';

interface RemoteResource {
  label: string;
  url: string;
  opfsPath: string;
}

interface CachedItem {
  meta: StorageFileMeta;
  objectUrl: string;
}

interface LogEntry {
  timestamp: number;
  kind: 'hit' | 'download' | 'error';
  message: string;
}

const PRESETS: RemoteResource[] = [
  {
    label: 'Picsum #237 (puppy)',
    url: 'https://picsum.photos/id/237/300/200',
    opfsPath: 'remote/picsum-237.jpg'
  },
  {
    label: 'Picsum #433 (cliff)',
    url: 'https://picsum.photos/id/433/300/200',
    opfsPath: 'remote/picsum-433.jpg'
  },
  {
    label: 'Picsum #1015 (river)',
    url: 'https://picsum.photos/id/1015/300/200',
    opfsPath: 'remote/picsum-1015.jpg'
  }
];

const REMOTE_DIR = '/remote';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8);
}

async function measureElapsedMs<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, elapsedMs: Math.round(performance.now() - start) };
}

export default function RemoteCachePage() {
  const rxdb = useRxDB();

  const [customUrl, setCustomUrl] = useState('https://picsum.photos/id/1025/300/200');
  const [customPath, setCustomPath] = useState('remote/picsum-1025.jpg');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [cached, setCached] = useState<CachedItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  const pushLog = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
    setLogs(previous => [{ ...entry, timestamp: Date.now() }, ...previous].slice(0, 20));
  }, []);

  const loadCachedItems = useCallback(async (): Promise<CachedItem[]> => {
    const metas = await rxdb.storage.list({ path: REMOTE_DIR });
    const liveIds = new Set<string>(metas.map(meta => meta.id as string));

    for (const [id, url] of Array.from(objectUrlsRef.current.entries())) {
      if (!liveIds.has(id)) {
        rxdb.storage.revokeObjectUrl(url);
        objectUrlsRef.current.delete(id);
      }
    }

    const items: CachedItem[] = [];
    for (const meta of metas) {
      let objectUrl = objectUrlsRef.current.get(meta.id);
      if (!objectUrl) {
        objectUrl = await rxdb.storage.createObjectUrl(meta.id);
        objectUrlsRef.current.set(meta.id, objectUrl);
      }
      items.push({ meta, objectUrl });
    }

    return items;
  }, [rxdb]);

  const refresh = useCallback(async () => {
    setCached(await loadCachedItems());
  }, [loadCachedItems]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const objectUrls = objectUrlsRef.current;
    void loadCachedItems().then(setCached);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      for (const url of objectUrls.values()) {
        rxdb.storage.revokeObjectUrl(url);
      }
      objectUrls.clear();
    };
  }, [loadCachedItems, rxdb]);

  const describeError = (error: unknown, resource: RemoteResource): string => {
    if (error instanceof StorageOfflineError) {
      return `Offline: ${resource.url} (cached miss for ${resource.opfsPath})`;
    }
    if (error instanceof StorageFetchError) {
      return `HTTP ${error.status}: ${resource.url}`;
    }
    if (error instanceof StorageMimeTypeMissingError) {
      return `Missing MIME: ${resource.url} (set Content-Type or pass options.mimeType)`;
    }
    return error instanceof Error ? error.message : String(error);
  };

  const fetchResource = async (resource: RemoteResource) => {
    const key = `${resource.opfsPath}|${resource.url}`;
    if (busyKey === key) return;
    setBusyKey(key);

    const wasCached = cached.some(item => item.meta.opfsPath === resource.opfsPath);

    try {
      const { elapsedMs } = await measureElapsedMs(() => rxdb.storage.fetch(resource.opfsPath, { url: resource.url }));

      pushLog({
        kind: wasCached ? 'hit' : 'download',
        message:
          wasCached ?
            `OPFS hit: ${resource.opfsPath} (${elapsedMs}ms, no network)`
          : `Downloaded: ${resource.url} → ${resource.opfsPath} (${elapsedMs}ms)`
      });

      await refresh();
    } catch (error) {
      pushLog({ kind: 'error', message: describeError(error, resource) });
    } finally {
      setBusyKey(null);
    }
  };

  const fetchCustom = async () => {
    const url = customUrl.trim();
    const opfsPath = customPath.trim();
    if (!url || !opfsPath) {
      pushLog({ kind: 'error', message: 'URL and OPFS path are both required' });
      return;
    }

    await fetchResource({ label: 'Custom', url, opfsPath });
  };

  const deleteCached = async (item: CachedItem) => {
    try {
      await rxdb.storage.delete(item.meta.id);
      pushLog({ kind: 'download', message: `Deleted: ${item.meta.opfsPath}` });
      await refresh();
    } catch (error) {
      pushLog({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const clearAll = async () => {
    try {
      await rxdb.storage.clear(REMOTE_DIR);
      pushLog({ kind: 'download', message: `Cleared cache directory ${REMOTE_DIR}` });
      await refresh();
    } catch (error) {
      pushLog({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const isBusy = (resource: RemoteResource) => busyKey === `${resource.opfsPath}|${resource.url}`;
  const isCached = useMemo(() => new Set(cached.map(item => item.meta.opfsPath)), [cached]);

  return (
    <div className='flex h-full flex-col'>
      <div className='border-base-300 flex items-center justify-between border-b px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Cloud size={20} />
          <div>
            <h2 className='text-base font-bold'>Remote Cache</h2>
            <p className='text-base-content/60 text-xs'>
              OPFS-first 缓存示例：首次联网下载 → 落盘 OPFS + StorageFileMeta → 后续命中本地不联网
            </p>
          </div>
        </div>
        <div className='flex items-center gap-1.5'>
          {online ?
            <>
              <Wifi className='text-success' size={16} />
              <span className='text-success text-xs font-semibold'>Online</span>
            </>
          : <>
              <WifiOff className='text-error' size={16} />
              <span className='text-error text-xs font-semibold'>Offline</span>
            </>
          }
        </div>
      </div>

      <div className='flex-1 overflow-auto p-4'>
        <div className='mx-auto flex max-w-5xl flex-col gap-6'>
          <section className='card bg-base-100 border-base-300 border'>
            <div className='card-body p-4'>
              <h3 className='text-sm font-bold'>预设资源</h3>
              <p className='text-base-content/60 text-xs'>点击按钮触发 {'`rxdb.storage.fetch(opfsPath, { url })`'}。</p>

              <div className='mt-3 grid gap-2 sm:grid-cols-3'>
                {PRESETS.map(preset => {
                  const busy = isBusy(preset);
                  return (
                    <button
                      key={preset.opfsPath}
                      className={`btn btn-sm justify-between gap-2 ${isCached.has(preset.opfsPath) ? 'btn-success' : 'btn-primary'}`}
                      disabled={busy}
                      onClick={() => void fetchResource(preset)}
                    >
                      <span className='truncate text-left'>
                        <span className='block text-xs font-bold'>{preset.label}</span>
                        <span className='block text-[10px] opacity-70'>{preset.opfsPath}</span>
                      </span>
                      {busy ?
                        <RefreshCw className='animate-spin' size={14} />
                      : <CloudDownload size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className='card bg-base-100 border-base-300 border'>
            <div className='card-body p-4'>
              <h3 className='text-sm font-bold'>自定义 URL</h3>
              <p className='text-base-content/60 text-xs'>输入任意 CORS 友好的 URL 和 OPFS 路径。</p>

              <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                <label className='form-control'>
                  <span className='label-text text-xs'>URL</span>
                  <input
                    className='input input-bordered input-sm'
                    onChange={event => setCustomUrl(event.target.value)}
                    placeholder='https://example.com/image.jpg'
                    type='url'
                    value={customUrl}
                  />
                </label>
                <label className='form-control'>
                  <span className='label-text text-xs'>OPFS Path</span>
                  <input
                    className='input input-bordered input-sm'
                    onChange={event => setCustomPath(event.target.value)}
                    placeholder='remote/example.jpg'
                    value={customPath}
                  />
                </label>
              </div>

              <div className='mt-3'>
                <button className='btn btn-sm btn-primary gap-2' onClick={() => void fetchCustom()}>
                  <CloudDownload size={14} />
                  Fetch
                </button>
              </div>
            </div>
          </section>

          <section className='card bg-base-100 border-base-300 border'>
            <div className='card-body p-4'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-bold' data-testid='remote-cache-count'>
                  已缓存（{cached.length}）
                </h3>
                {cached.length > 0 && (
                  <button className='btn btn-xs btn-ghost gap-1' onClick={() => void clearAll()}>
                    <Trash2 size={12} />
                    Clear all
                  </button>
                )}
              </div>

              {cached.length === 0 ?
                <p className='text-base-content/50 mt-2 text-xs' data-testid='remote-cache-empty'>
                  还没有缓存内容。点击上方预设或自定义按钮开始。
                </p>
              : <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3'>
                  {cached.map(item => (
                    <div key={item.meta.id} className='card bg-base-200 overflow-hidden'>
                      <figure className='bg-base-300 aspect-video'>
                        {isImageMimeType(item.meta.mimeType) ?
                          <img
                            alt={item.meta.opfsPath}
                            className='h-full w-full object-cover'
                            loading='lazy'
                            src={item.objectUrl}
                          />
                        : <div className='flex h-full w-full flex-col items-center justify-center gap-2'>
                            <File aria-hidden='true' size={32} />
                            <span className='text-xs'>{item.meta.mimeType}</span>
                          </div>
                        }
                      </figure>
                      <div className='card-body gap-1 p-3'>
                        <p className='truncate text-xs font-semibold' title={item.meta.opfsPath}>
                          {item.meta.opfsPath}
                        </p>
                        <p className='text-base-content/60 text-[10px]'>
                          {item.meta.mimeType} · {formatFileSize(item.meta.size)}
                        </p>
                        <button className='btn btn-xs btn-error mt-1 gap-1' onClick={() => void deleteCached(item)}>
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </section>

          <section className='card bg-base-100 border-base-300 border'>
            <div className='card-body p-4'>
              <h3 className='text-sm font-bold'>事件日志</h3>
              {logs.length === 0 ?
                <p className='text-base-content/50 mt-2 text-xs' data-testid='remote-cache-log-empty'>
                  日志为空。
                </p>
              : <ul className='mt-2 space-y-1 font-mono text-[11px]'>
                  {logs.map(entry => (
                    <li key={entry.timestamp} className='flex gap-2' data-testid='remote-cache-log-entry'>
                      <span className='text-base-content/40 whitespace-nowrap'>{formatTime(entry.timestamp)}</span>
                      <span
                        className={`badge badge-xs ${
                          entry.kind === 'error' ? 'badge-error'
                          : entry.kind === 'download' ? 'badge-info'
                          : 'badge-success'
                        }`}
                      >
                        {entry.kind}
                      </span>
                      <span className='truncate'>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

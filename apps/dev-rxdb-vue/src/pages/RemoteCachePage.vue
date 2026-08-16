<script lang="ts" setup>
import {
  StorageFetchError,
  StorageFileMeta,
  StorageMimeTypeMissingError,
  StorageOfflineError
} from '@aiao/rxdb-plugin-storage';
import { useRxDB } from '@aiao/rxdb-vue';
import { formatFileSize } from '@aiao/utils';
import { Cloud, CloudDownload, Download, FileText, RefreshCw, Trash2, Wifi, WifiOff } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { resolveRemoteCachePreviewKind } from './remote-cache-preview';

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

const rxdb = useRxDB();

const customUrl = ref('https://picsum.photos/id/1025/300/200');
const customPath = ref('remote/picsum-1025.jpg');
const busyKey = ref<string | null>(null);
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const cached = ref<CachedItem[]>([]);
const logs = ref<LogEntry[]>([]);

const objectUrls = new Map<string, string>();

const cachedSet = computed(() => new Set(cached.value.map(item => item.meta.opfsPath)));

function formatTime(timestamp: number): string {
  return new Date(timestamp).toTimeString().slice(0, 8);
}

function pushLog(entry: Omit<LogEntry, 'timestamp'>): void {
  logs.value = [{ ...entry, timestamp: Date.now() }, ...logs.value].slice(0, 20);
}

function describeError(error: unknown, resource: RemoteResource): string {
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
}

async function refresh(): Promise<void> {
  const metas = await rxdb.storage.list({ path: REMOTE_DIR });
  const liveIds = new Set<string>(metas.map(meta => meta.id as string));

  for (const [id, url] of Array.from(objectUrls.entries())) {
    if (!liveIds.has(id)) {
      rxdb.storage.revokeObjectUrl(url);
      objectUrls.delete(id);
    }
  }

  const items: CachedItem[] = [];
  for (const meta of metas) {
    let objectUrl = objectUrls.get(meta.id);
    if (!objectUrl) {
      objectUrl = await rxdb.storage.createObjectUrl(meta.id);
      objectUrls.set(meta.id, objectUrl);
    }
    items.push({ meta, objectUrl });
  }

  cached.value = items;
}

async function fetchResource(resource: RemoteResource): Promise<void> {
  const key = `${resource.opfsPath}|${resource.url}`;
  if (busyKey.value === key) return;
  busyKey.value = key;

  const wasCached = cached.value.some(item => item.meta.opfsPath === resource.opfsPath);

  try {
    const startedAt = performance.now();
    await rxdb.storage.fetch(resource.opfsPath, { url: resource.url });
    const elapsed = Math.round(performance.now() - startedAt);

    pushLog({
      kind: wasCached ? 'hit' : 'download',
      message:
        wasCached ?
          `OPFS hit: ${resource.opfsPath} (${elapsed}ms, no network)`
        : `Downloaded: ${resource.url} → ${resource.opfsPath} (${elapsed}ms)`
    });

    await refresh();
  } catch (error) {
    pushLog({ kind: 'error', message: describeError(error, resource) });
  } finally {
    busyKey.value = null;
  }
}

async function fetchCustom(): Promise<void> {
  const url = customUrl.value.trim();
  const opfsPath = customPath.value.trim();
  if (!url || !opfsPath) {
    pushLog({ kind: 'error', message: 'URL and OPFS path are both required' });
    return;
  }

  await fetchResource({ label: 'Custom', url, opfsPath });
}

async function deleteCached(item: CachedItem): Promise<void> {
  try {
    await rxdb.storage.delete(item.meta.id);
    pushLog({ kind: 'download', message: `Deleted: ${item.meta.opfsPath}` });
    await refresh();
  } catch (error) {
    pushLog({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

async function clearAll(): Promise<void> {
  try {
    await rxdb.storage.clear(REMOTE_DIR);
    pushLog({ kind: 'download', message: `Cleared cache directory ${REMOTE_DIR}` });
    await refresh();
  } catch (error) {
    pushLog({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

function isBusy(resource: RemoteResource): boolean {
  return busyKey.value === `${resource.opfsPath}|${resource.url}`;
}

const onOnline = () => (online.value = true);
const onOffline = () => (online.value = false);

onMounted(async () => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  await refresh();
});

onUnmounted(() => {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  for (const url of objectUrls.values()) {
    rxdb.storage.revokeObjectUrl(url);
  }
  objectUrls.clear();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="border-base-300 flex items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2">
        <Cloud :size="20" />
        <div>
          <h2 class="text-base font-bold">Remote Cache</h2>
          <p class="text-base-content/60 text-xs">
            OPFS-first 缓存示例：首次联网下载 → 落盘 OPFS + StorageFileMeta → 后续命中本地不联网
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <template v-if="online">
          <Wifi
            class="text-success"
            :size="16"
          />
          <span class="text-success text-xs font-semibold">Online</span>
        </template>
        <template v-else>
          <WifiOff
            class="text-error"
            :size="16"
          />
          <span class="text-error text-xs font-semibold">Offline</span>
        </template>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div class="mx-auto flex max-w-5xl flex-col gap-6">
        <section class="card bg-base-100 border-base-300 border">
          <div class="card-body p-4">
            <h3 class="text-sm font-bold">预设资源</h3>
            <p class="text-base-content/60 text-xs">点击按钮触发 `rxdb.storage.fetch(opfsPath, { url })`。</p>

            <div class="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                class="btn btn-sm justify-between gap-2"
                v-for="preset in PRESETS"
                :class="cachedSet.has(preset.opfsPath) ? 'btn-success' : 'btn-primary'"
                :disabled="isBusy(preset)"
                :key="preset.opfsPath"
                @click="fetchResource(preset)"
              >
                <span class="truncate text-left">
                  <span class="block text-xs font-bold">{{ preset.label }}</span>
                  <span class="block text-[10px] opacity-70">{{ preset.opfsPath }}</span>
                </span>
                <RefreshCw
                  class="animate-spin"
                  v-if="isBusy(preset)"
                  :size="14"
                />
                <CloudDownload
                  v-else
                  :size="14"
                />
              </button>
            </div>
          </div>
        </section>

        <section class="card bg-base-100 border-base-300 border">
          <div class="card-body p-4">
            <h3 class="text-sm font-bold">自定义 URL</h3>
            <p class="text-base-content/60 text-xs">输入任意 CORS 友好的 URL 和 OPFS 路径。</p>

            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text text-xs">URL</span>
                <input
                  class="input input-bordered input-sm"
                  v-model="customUrl"
                  placeholder="https://example.com/image.jpg"
                  type="url"
                />
              </label>
              <label class="form-control">
                <span class="label-text text-xs">OPFS Path</span>
                <input
                  class="input input-bordered input-sm"
                  v-model="customPath"
                  placeholder="remote/example.jpg"
                />
              </label>
            </div>

            <div class="mt-3">
              <button
                class="btn btn-sm btn-primary gap-2"
                @click="fetchCustom"
              >
                <CloudDownload :size="14" />
                Fetch
              </button>
            </div>
          </div>
        </section>

        <section class="card bg-base-100 border-base-300 border">
          <div class="card-body p-4">
            <div class="flex items-center justify-between">
              <h3
                class="text-sm font-bold"
                data-testid="remote-cache-count"
              >
                已缓存（{{ cached.length }}）
              </h3>
              <button
                class="btn btn-xs btn-ghost gap-1"
                v-if="cached.length > 0"
                @click="clearAll"
              >
                <Trash2 :size="12" />
                Clear all
              </button>
            </div>

            <p
              class="text-base-content/50 mt-2 text-xs"
              v-if="cached.length === 0"
              data-testid="remote-cache-empty"
            >
              还没有缓存内容。点击上方预设或自定义按钮开始。
            </p>
            <div
              class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3"
              v-else
            >
              <div
                class="card bg-base-200 overflow-hidden"
                v-for="item in cached"
                :key="item.meta.id"
              >
                <figure class="bg-base-300 flex aspect-video items-center justify-center overflow-hidden">
                  <img
                    class="h-full w-full object-cover"
                    v-if="resolveRemoteCachePreviewKind(item.meta.mimeType) === 'image'"
                    :alt="item.meta.opfsPath"
                    :src="item.objectUrl"
                    loading="lazy"
                  />
                  <audio
                    class="w-[90%]"
                    v-else-if="resolveRemoteCachePreviewKind(item.meta.mimeType) === 'audio'"
                    :src="item.objectUrl"
                    controls
                    preload="metadata"
                  />
                  <video
                    class="h-full w-full object-contain"
                    v-else-if="resolveRemoteCachePreviewKind(item.meta.mimeType) === 'video'"
                    :src="item.objectUrl"
                    controls
                    preload="metadata"
                  />
                  <iframe
                    class="h-full w-full border-0 bg-white"
                    v-else-if="resolveRemoteCachePreviewKind(item.meta.mimeType) === 'text'"
                    :src="item.objectUrl"
                    :title="item.meta.opfsPath"
                    sandbox=""
                  />
                  <object
                    class="h-full w-full"
                    v-else-if="resolveRemoteCachePreviewKind(item.meta.mimeType) === 'document'"
                    :data="item.objectUrl"
                    :type="item.meta.mimeType"
                  >
                    <FileText :size="32" />
                  </object>
                  <FileText
                    class="text-base-content/40"
                    v-else
                    :size="40"
                  />
                </figure>
                <div class="card-body gap-1 p-3">
                  <p
                    class="truncate text-xs font-semibold"
                    :title="item.meta.opfsPath"
                  >
                    {{ item.meta.opfsPath }}
                  </p>
                  <p class="text-base-content/60 text-[10px]">
                    {{ item.meta.mimeType }} · {{ formatFileSize(item.meta.size) }}
                  </p>
                  <div class="mt-1 flex gap-1">
                    <a
                      class="btn btn-xs btn-ghost flex-1 gap-1"
                      :download="item.meta.name"
                      :href="item.objectUrl"
                    >
                      <Download :size="12" />
                      Download
                    </a>
                    <button
                      class="btn btn-xs btn-error flex-1 gap-1"
                      @click="deleteCached(item)"
                    >
                      <Trash2 :size="12" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="card bg-base-100 border-base-300 border">
          <div class="card-body p-4">
            <h3 class="text-sm font-bold">事件日志</h3>
            <p
              class="text-base-content/50 mt-2 text-xs"
              v-if="logs.length === 0"
              data-testid="remote-cache-log-empty"
            >
              日志为空。
            </p>
            <ul
              class="mt-2 space-y-1 font-mono text-[11px]"
              v-else
            >
              <li
                class="flex gap-2"
                v-for="entry in logs"
                :key="entry.timestamp"
                data-testid="remote-cache-log-entry"
              >
                <span class="text-base-content/40 whitespace-nowrap">{{ formatTime(entry.timestamp) }}</span>
                <span
                  class="badge badge-xs"
                  :class="{
                    'badge-error': entry.kind === 'error',
                    'badge-info': entry.kind === 'download',
                    'badge-success': entry.kind === 'hit'
                  }"
                >
                  {{ entry.kind }}
                </span>
                <span class="truncate">{{ entry.message }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

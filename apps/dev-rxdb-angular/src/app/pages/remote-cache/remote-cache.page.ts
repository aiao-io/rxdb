import { RxDB } from '@aiao/rxdb';
import {
  StorageFetchError,
  StorageFileMeta,
  StorageMimeTypeMissingError,
  StorageOfflineError
} from '@aiao/rxdb-plugin-storage';
import { formatFileSize } from '@aiao/utils';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  LucideCloud as Cloud,
  LucideCloudDownload as CloudDownload,
  LucideDynamicIcon,
  LucideRefreshCw as RefreshCw,
  LucideTrash2 as Trash2,
  LucideWifi as Wifi,
  LucideWifiOff as WifiOff
} from '@lucide/angular';
import { I18nPipe } from '../../pipes/i18n.pipe';
import { createObjectUrlCache } from './remote-cache-object-urls';

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

@Component({
  selector: 'app-remote-cache-page',
  imports: [CommonModule, LucideDynamicIcon, I18nPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './remote-cache.page.html'
})
export default class RemoteCachePage implements OnInit, OnDestroy {
  private onlineListener?: () => void;
  private offlineListener?: () => void;

  readonly rxdb = inject(RxDB);

  private readonly previews = createObjectUrlCache<StorageFileMeta>({
    list: () => this.rxdb.storage.list({ path: REMOTE_DIR }),
    createObjectUrl: id => this.rxdb.storage.createObjectUrl(id),
    revokeObjectUrl: url => this.rxdb.storage.revokeObjectUrl(url)
  });

  readonly Cloud = Cloud;
  readonly CloudDownload = CloudDownload;
  readonly RefreshCw = RefreshCw;
  readonly Trash2 = Trash2;
  readonly Wifi = Wifi;
  readonly WifiOff = WifiOff;
  readonly formatFileSize = formatFileSize;
  readonly presets = PRESETS;

  readonly customUrl = signal('https://picsum.photos/id/1025/300/200');
  readonly customPath = signal('remote/picsum-1025.jpg');
  readonly busyKey = signal<string | null>(null);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly cached = signal<CachedItem[]>([]);
  readonly logs = signal<LogEntry[]>([]);

  readonly cachedCount = computed(() => this.cached().length);

  async ngOnInit(): Promise<void> {
    this.onlineListener = () => this.online.set(true);
    this.offlineListener = () => this.online.set(false);
    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
    await this.refresh();
  }

  ngOnDestroy(): void {
    if (this.onlineListener) window.removeEventListener('online', this.onlineListener);
    if (this.offlineListener) window.removeEventListener('offline', this.offlineListener);
    this.previews.dispose();
  }

  async fetchResource(resource: RemoteResource): Promise<void> {
    const key = `${resource.opfsPath}|${resource.url}`;
    if (this.busyKey() === key) return;
    this.busyKey.set(key);

    const wasCached = this.cached().some(item => item.meta.opfsPath === resource.opfsPath);

    try {
      const startedAt = performance.now();
      await this.rxdb.storage.fetch(resource.opfsPath, { url: resource.url });
      const elapsed = Math.round(performance.now() - startedAt);

      this.pushLog({
        kind: wasCached ? 'hit' : 'download',
        message:
          wasCached ?
            `OPFS hit: ${resource.opfsPath} (${elapsed}ms, no network)`
          : `Downloaded: ${resource.url} → ${resource.opfsPath} (${elapsed}ms)`
      });

      await this.refresh();
    } catch (error) {
      this.pushLog({ kind: 'error', message: this.describeError(error, resource) });
    } finally {
      this.busyKey.set(null);
    }
  }

  async fetchCustom(): Promise<void> {
    const url = this.customUrl().trim();
    const opfsPath = this.customPath().trim();
    if (!url || !opfsPath) {
      this.pushLog({ kind: 'error', message: 'URL and OPFS path are both required' });
      return;
    }

    await this.fetchResource({ label: 'Custom', url, opfsPath });
  }

  async deleteCached(item: CachedItem): Promise<void> {
    try {
      await this.rxdb.storage.delete(item.meta.id);
      this.pushLog({ kind: 'download', message: `Deleted: ${item.meta.opfsPath}` });
      await this.refresh();
    } catch (error) {
      this.pushLog({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async clearAll(): Promise<void> {
    try {
      await this.rxdb.storage.clear(REMOTE_DIR);
      this.pushLog({ kind: 'download', message: `Cleared cache directory ${REMOTE_DIR}` });
      await this.refresh();
    } catch (error) {
      this.pushLog({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  onCustomUrlInput(event: Event): void {
    this.customUrl.set((event.target as HTMLInputElement).value);
  }

  onCustomPathInput(event: Event): void {
    this.customPath.set((event.target as HTMLInputElement).value);
  }

  isBusy(resource: RemoteResource): boolean {
    return this.busyKey() === `${resource.opfsPath}|${resource.url}`;
  }

  isCached(opfsPath: string): boolean {
    return this.cached().some(item => item.meta.opfsPath === opfsPath);
  }

  trackByMetaId(_: number, item: CachedItem): string {
    return item.meta.id;
  }

  private async refresh(): Promise<void> {
    const items = await this.previews.load();
    if (items) this.cached.set(items);
  }

  private pushLog(entry: Omit<LogEntry, 'timestamp'>): void {
    const next = [{ ...entry, timestamp: Date.now() }, ...this.logs()].slice(0, 20);
    this.logs.set(next);
  }

  private describeError(error: unknown, resource: RemoteResource): string {
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
}

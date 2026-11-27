import { StorageFilesystem, createOpfsStorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { Service, inject } from '@angular/core';

import { DesktopData } from '../data/desktop-data';
import { THUMBNAIL_DIRECTORY } from '../data/desktop-data-location';
import { DESKTOP_ADAPTER } from '../data/desktop-database';
import { THUMBNAIL_MIME_TYPE, generateImageThumbnail } from '../shared/image-thumbnail';
import { imageDataUrl } from '../shared/image-url';

const thumbnailPath = (id: string): string => `${THUMBNAIL_DIRECTORY}/v1-${encodeURIComponent(id)}.png`;

const thumbnailUrl = async (blob: Blob): Promise<string> =>
  imageDataUrl(new Uint8Array(await blob.arrayBuffer()), THUMBNAIL_MIME_TYPE);

/** 按内容 ID 缓存可重建的缩略图，不占用文件元数据。 */
@Service({ autoProvided: false })
export class ImageThumbnailCache {
  private readonly data = inject(DesktopData);
  private readonly pending = new Map<string, Promise<string | null>>();
  private filesystem: StorageFilesystem | undefined;

  /** 同一页同时显示同一张图时共用一次读取或生成。 */
  get(contentId: string): Promise<string | null> {
    const pending = this.pending.get(contentId);
    if (pending) return pending;
    const task = this.load(contentId)
      .catch(() => null)
      .finally(() => this.pending.delete(contentId));
    this.pending.set(contentId, task);
    return task;
  }

  /** 文件体被释放或缓存损坏时清理。缓存清理失败不影响磁盘操作。 */
  remove(contentId: string): Promise<void> {
    return this.exclusive(filesystem => filesystem.removeFile(thumbnailPath(contentId))).catch(() => undefined);
  }

  /** 抹掉磁盘时一起清除缓存。 */
  clear(): Promise<void> {
    return this.exclusive(filesystem => filesystem.removeDirectory(THUMBNAIL_DIRECTORY)).catch(() => undefined);
  }

  private async load(contentId: string): Promise<string> {
    const { storage } = await this.data.ready;
    return this.exclusive(async filesystem => {
      const path = thumbnailPath(contentId);
      const cached = await filesystem.readBlob(path).catch(() => null);
      if (cached?.size) return thumbnailUrl(cached);
      const thumbnail = await generateImageThumbnail(await storage.read(contentId));
      await this.write(filesystem, path, thumbnail).catch(() => undefined);
      return thumbnailUrl(thumbnail);
    });
  }

  private async write(filesystem: StorageFilesystem, path: string, blob: Blob): Promise<void> {
    const writer = await filesystem.openWrite(path);
    try {
      await writer.write(blob);
      await writer.close();
    } catch (error) {
      await writer.abort(error);
    }
  }

  /** 磁盘释放文件体后才进缓存锁，锁内不回调磁盘；不同标签页也只需生成一次。 */
  private async exclusive<T>(task: (filesystem: StorageFilesystem) => Promise<T>): Promise<T> {
    const guard = this.data.locationGuard;
    const root = guard.location.filesRoot;
    return this.data.tabs.exclusive(
      () =>
        guard.write(() => {
          this.filesystem ??= createOpfsStorageFilesystem(root, { localAdapterName: DESKTOP_ADAPTER });
          return task(this.filesystem);
        }),
      `aiao-desktop-thumbnails:${root}`
    );
  }
}

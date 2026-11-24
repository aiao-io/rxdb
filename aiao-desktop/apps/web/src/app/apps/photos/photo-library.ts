import { Service, computed, inject } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { Preferences } from '../../data/preferences';
import { PhotoAlbum, PhotoAsset } from './photos.entities';

/** 导入的照片放进这个相簿。 */
export const IMPORTED_ALBUM = 'Imported';

/**
 * 废纸篓里照片 id 的偏好键。PhotoAsset 是发布过的实体，字段不能直接加（schema 指纹会变）；
 * 废纸篓是应用自身的元数据，存在系统偏好里，跨标签页同步。
 */
export const PHOTOS_TRASH_KEY = 'com.apple.Photos.trash';

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

/** 从网上导入的一张照片，还没有日期和相簿。 */
export interface ImportedPhoto {
  readonly title: string;
  readonly credit: string;
  readonly thumb: string;
}

/** 某个名字的相簿。 */
const albumNamed = (name: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'name' as const, operator: '=' as const, value: name }]
});

/**
 * 照片库：存在本地库里的应用数据，整个桌面共用一份（关掉再打开照片，删掉的和导入的都还在）。
 * 列表是信号，库里每次改动都换一个新数组；网格按编号跟踪，所以改一张不会让别的格子重载。
 */
@Service({ autoProvided: false })
export class PhotoLibrary {
  private readonly data = inject(DesktopData);
  private readonly preferences = inject(Preferences);

  private readonly rows = liveQuery(
    () => PhotoAsset.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    null as PhotoAsset[] | null,
    PhotoAsset
  );

  /** 全部照片，导入的在最前面。 */
  readonly photos = computed(() => this.rows() ?? []);
  /** 库里的照片读到之前为 false；空状态提示等它变成 true 才出现，开机时不会一闪而过。 */
  readonly loaded = computed(() => this.rows() !== null);
  /** 废纸篓里的照片 id：图库视图不显示它们，Recently Deleted 只显示它们。 */
  readonly trash = computed(() => new Set(this.preferences.get(PHOTOS_TRASH_KEY, isIdList) ?? []));
  /** 全部相簿，按名字排序。 */
  readonly albums = liveQuery(
    () => PhotoAlbum.findAll({ where: ALL_ROWS, orderBy: [{ field: 'name', sort: 'asc' }] }),
    [],
    PhotoAlbum
  );

  /** 切换收藏，返回切换后的状态。 */
  async toggleFavourite(photo: PhotoAsset): Promise<boolean> {
    const favourite = !photo.favourite;
    await (await this.data.repository(PhotoAsset)).update(photo, { favourite });
    return favourite;
  }

  /** 移进废纸篓（软删）：行保留，图库视图不再显示。 */
  trashPhoto(photo: PhotoAsset): Promise<void> {
    return this.preferences.update(PHOTOS_TRASH_KEY, isIdList, ids => [...new Set([...(ids ?? []), photo.id])]);
  }

  /** 从废纸篓恢复。 */
  restorePhoto(photo: PhotoAsset): Promise<void> {
    return this.clearTrash(photo.id);
  }

  /** 永久删除：行和废纸篓记录一起清掉。 */
  async remove(photo: PhotoAsset): Promise<void> {
    await (await this.data.repository(PhotoAsset)).remove(photo);
    await this.clearTrash(photo.id);
  }

  /** 导入的照片排在最前，进「Imported」相簿；第一次导入时同时建出这个相簿。 */
  add(item: ImportedPhoto): Promise<PhotoAsset> {
    return this.data.transaction(async executor => {
      const albums = executor.getRepository(PhotoAlbum);
      const assets = executor.getRepository(PhotoAsset);
      const [imported] = await albums.find({ where: albumNamed(IMPORTED_ALBUM), limit: 1 });
      if (!imported) await albums.create(this.data.instantiate(PhotoAlbum, { name: IMPORTED_ALBUM }));
      const [first] = await assets.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 1 });
      return assets.create(
        this.data.instantiate(PhotoAsset, {
          title: item.title,
          place: '',
          credit: item.credit,
          album: IMPORTED_ALBUM,
          date: new Date().toISOString().slice(0, 10),
          thumb: item.thumb,
          favourite: false,
          position: first ? first.position - 1 : 0
        })
      );
    });
  }

  private clearTrash(id: string): Promise<void> {
    return this.preferences.update(PHOTOS_TRASH_KEY, isIdList, ids => (ids ?? []).filter(item => item !== id));
  }
}

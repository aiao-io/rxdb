import { Service, signal } from '@angular/core';

import { PHOTO_SEED, Photo } from './photos-data';

/** 从网上导入的一张照片，还没有编号和日期。 */
export interface ImportedPhoto {
  readonly title: string;
  readonly credit: string;
  readonly thumb: string;
}

/**
 * 照片库：可变的应用数据，整个桌面共用一份（关掉再打开照片，删掉的和导入的都还在）。
 * 列表是信号，每次修改都换一个新数组，网格按编号跟踪，所以改一张不会让别的格子重载。
 */
@Service()
export class PhotoLibrary {
  private nextId = PHOTO_SEED.length;

  readonly photos = signal<readonly Photo[]>(PHOTO_SEED);

  /** 切换收藏，返回切换后的状态。 */
  toggleFavourite(id: number): boolean {
    const fav = !this.photos().find(photo => photo.id === id)?.fav;
    this.photos.update(photos => photos.map(photo => (photo.id === id ? { ...photo, fav } : photo)));
    return fav;
  }

  remove(id: number): void {
    this.photos.update(photos => photos.filter(photo => photo.id !== id));
  }

  /** 导入的照片排在最前，进「Imported」相簿。 */
  add(item: ImportedPhoto): Photo {
    const photo: Photo = {
      id: ++this.nextId,
      title: item.title,
      place: '',
      credit: item.credit,
      album: 'Imported',
      date: new Date().toISOString().slice(0, 10),
      thumb: item.thumb,
      fav: false
    };
    this.photos.update(photos => [photo, ...photos]);
    return photo;
  }
}

import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { PHOTO_SEED_DATA } from './photos-data';
import { PhotoAlbum, PhotoAsset } from './photos.entities';

/** 照片的初始数据：四十张维基共享资源的特色图片（顺序与原来一致），以及它们所在的相簿。 */
export const PHOTOS_SEED: DataSeed = {
  domain: 'photos',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const albums = executor.getRepository(PhotoAlbum);
    const assets = executor.getRepository(PhotoAsset);
    const { entityManager } = rxdb;
    for (const name of new Set(PHOTO_SEED_DATA.map(photo => photo.album)))
      await albums.create(entityManager.instantiate(PhotoAlbum, { name }));
    for (const [position, photo] of PHOTO_SEED_DATA.entries())
      await assets.create(
        entityManager.instantiate(PhotoAsset, {
          title: photo.title,
          place: photo.place,
          credit: photo.credit,
          album: photo.album,
          date: photo.date,
          thumb: photo.thumb,
          favourite: photo.fav,
          position
        })
      );
  }
};

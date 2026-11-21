import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { ALBUM_SEED_DATA, PLAYLIST_SEED_DATA, SONG_SEED_DATA } from './music-data';
import { MusicAlbum, MusicPlaylist, MusicTrack } from './music.entities';

/** 音乐的初始数据：六张专辑、十首歌（顺序即播放顺序）和侧栏的三个歌单。 */
export const MUSIC_SEED: DataSeed = {
  domain: 'music',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const albums = executor.getRepository(MusicAlbum);
    const tracks = executor.getRepository(MusicTrack);
    const playlists = executor.getRepository(MusicPlaylist);
    const { entityManager } = rxdb;
    const albumIds: string[] = [];
    for (const [position, album] of ALBUM_SEED_DATA.entries()) {
      const created = await albums.create(entityManager.instantiate(MusicAlbum, { ...album, position }));
      albumIds.push(created.id);
    }
    for (const [position, song] of SONG_SEED_DATA.entries())
      await tracks.create(
        entityManager.instantiate(MusicTrack, {
          title: song.title,
          artist: song.artist,
          albumId: albumIds[song.album],
          duration: song.duration,
          position
        })
      );
    for (const [position, name] of PLAYLIST_SEED_DATA.entries())
      await playlists.create(entityManager.instantiate(MusicPlaylist, { name, position }));
  }
};

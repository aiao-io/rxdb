import { mmss } from '../../shared/format';

/** 拼曲库时用到的专辑字段。 */
export interface AlbumFields {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly year: number;
  readonly position: number;
}

/** 拼曲库时用到的歌曲字段。 */
export interface TrackFields {
  readonly title: string;
  readonly artist: string;
  readonly albumId: string;
  readonly duration: number;
}

/** 专辑页的一格：`position` 是专辑次序，也是封面号。 */
export interface AlbumRow {
  readonly title: string;
  readonly artist: string;
  readonly year: number;
  readonly position: number;
}

/** 曲库里的一行：`index` 是它在曲库里的序号，`album` 是所属专辑的次序（封面号），`haystack` 是搜索时匹配的文本。 */
export interface SongRow {
  readonly index: number;
  readonly title: string;
  readonly artist: string;
  readonly album: number;
  readonly duration: number;
  readonly detail: string;
  readonly time: string;
  readonly haystack: string;
}

/** 「歌手」页的一格：`album` 是他第一张专辑的次序，封面沿用 `art` 号（序号 + 2，错开专辑页的配色）。 */
export interface Artist {
  readonly name: string;
  readonly album: number;
  readonly art: number;
}

/** 音乐 App 用的整个曲库：专辑、歌曲与歌手。 */
export interface MusicLibrary {
  readonly albums: readonly AlbumRow[];
  readonly songs: readonly SongRow[];
  readonly artists: readonly Artist[];
}

/** 还没从库里读到任何东西时的曲库。 */
export const EMPTY_LIBRARY: MusicLibrary = { albums: [], songs: [], artists: [] };

/** 按专辑出现顺序去重后的歌手。 */
const artistsOf = (albums: readonly AlbumFields[]): Artist[] => {
  const firstAlbums = new Map<string, AlbumFields>();
  for (const album of albums) if (!firstAlbums.has(album.artist)) firstAlbums.set(album.artist, album);
  return [...firstAlbums.values()].map((album, index) => ({
    name: album.artist,
    album: album.position,
    art: index + 2
  }));
};

/**
 * 把专辑行和歌曲行拼成界面用的曲库；专辑与歌曲都保持传入的顺序。
 * 歌曲指向不存在的专辑是数据损坏，直接抛错而不是悄悄丢掉这首歌。
 */
export function buildLibrary(albums: readonly AlbumFields[], tracks: readonly TrackFields[]): MusicLibrary {
  const byId = new Map(albums.map(album => [album.id, album] as const));
  const songs = tracks.map((track, index): SongRow => {
    const album = byId.get(track.albumId);
    if (!album) throw new Error(`The song “${track.title}” belongs to an album that does not exist`);
    return {
      index,
      title: track.title,
      artist: track.artist,
      album: album.position,
      duration: track.duration,
      detail: `${track.artist} — ${album.title}`,
      time: mmss(track.duration),
      haystack: `${track.title} ${track.artist} ${album.title}`.toLowerCase()
    };
  });
  return {
    albums: albums.map(({ title, artist, year, position }) => ({ title, artist, year, position })),
    songs,
    artists: artistsOf(albums)
  };
}

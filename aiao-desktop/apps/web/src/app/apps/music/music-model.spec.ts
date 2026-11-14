import { describe, expect, it } from 'vitest';

import { AlbumFields, EMPTY_LIBRARY, TrackFields, buildLibrary } from './music-model';

const album = (id: string, title: string, artist: string, position: number): AlbumFields => ({
  id,
  title,
  artist,
  year: 2026,
  position
});
const track = (title: string, artist: string, albumId: string, duration: number): TrackFields => ({
  title,
  artist,
  albumId,
  duration
});

const ALBUMS = [
  album('a0', 'Neon Interiors', 'Kaida', 0),
  album('a1', 'Deep Field', 'Orbital Fold', 1),
  album('a2', 'Glass Hours', 'Kaida', 2)
];

describe('buildLibrary', () => {
  it('歌曲行带上序号、封面号、详情、时长文字和搜索文本', () => {
    const { songs } = buildLibrary(ALBUMS, [
      track('Aurora Drift', 'Kaida', 'a0', 224),
      track('Low Orbit', 'Orbital Fold', 'a1', 268)
    ]);
    expect(songs[1]).toEqual({
      index: 1,
      title: 'Low Orbit',
      artist: 'Orbital Fold',
      album: 1,
      duration: 268,
      detail: 'Orbital Fold — Deep Field',
      time: '4:28',
      haystack: 'low orbit orbital fold deep field'
    });
  });

  it('专辑与歌曲保持传入的顺序', () => {
    const library = buildLibrary(ALBUMS, [track('B', 'Kaida', 'a2', 60), track('A', 'Kaida', 'a0', 60)]);
    expect(library.albums.map(item => item.title)).toEqual(['Neon Interiors', 'Deep Field', 'Glass Hours']);
    expect(library.songs.map(item => item.title)).toEqual(['B', 'A']);
    expect(library.songs.map(item => item.album)).toEqual([2, 0]);
  });

  it('歌手按专辑出现的顺序去重，指向他第一张专辑，封面号从 2 起', () => {
    expect(buildLibrary(ALBUMS, []).artists).toEqual([
      { name: 'Kaida', album: 0, art: 2 },
      { name: 'Orbital Fold', album: 1, art: 3 }
    ]);
  });

  it('歌曲指向不存在的专辑时抛错', () => {
    expect(() => buildLibrary(ALBUMS, [track('Lost', 'Nobody', 'gone', 10)])).toThrow('Lost');
  });

  it('空库得到空曲库', () => {
    expect(buildLibrary([], [])).toEqual(EMPTY_LIBRARY);
  });
});

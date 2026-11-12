/** 专辑封面的构图。 */
export type ArtShape = 'circles' | 'waves' | 'sun' | 'bars' | 'diag' | 'halftone' | 'peaks' | 'arch';

/** 一张封面：渐变的起止色加一个构图。 */
export interface AlbumArtSpec {
  readonly gradient: readonly [string, string];
  readonly shape: ArtShape;
}

/** 十二款封面，序号对 12 取余循环使用。 */
export const ART: readonly AlbumArtSpec[] = [
  { gradient: ['#ff6b8b', '#7c3aed'], shape: 'circles' },
  { gradient: ['#12c2e9', '#0b4f8a'], shape: 'waves' },
  { gradient: ['#f9d423', '#e65c00'], shape: 'sun' },
  { gradient: ['#141e30', '#243b55'], shape: 'bars' },
  { gradient: ['#43e97b', '#087f5b'], shape: 'diag' },
  { gradient: ['#f5f0e6', '#c0a880'], shape: 'halftone' },
  { gradient: ['#0f0f12', '#3a3a45'], shape: 'peaks' },
  { gradient: ['#ff9a44', '#fc6076'], shape: 'sun' },
  { gradient: ['#2b1055', '#7597de'], shape: 'peaks' },
  { gradient: ['#e0e5ec', '#9aa5b1'], shape: 'arch' },
  { gradient: ['#00b4db', '#003357'], shape: 'waves' },
  { gradient: ['#ee0979', '#ff6a00'], shape: 'diag' }
];

/** 一张专辑。 */
export interface Album {
  readonly title: string;
  readonly artist: string;
  readonly year: number;
}

/** 曲库里的专辑。 */
export const ALBUMS: readonly Album[] = [
  { title: 'Neon Interiors', artist: 'Kaida', year: 2026 },
  { title: 'Deep Field', artist: 'Orbital Fold', year: 2025 },
  { title: 'Golden Hour', artist: 'The Vireo', year: 2024 },
  { title: 'Nightgraph', artist: 'Sable Court', year: 2026 },
  { title: 'Fernlight', artist: 'Moss & Marrow', year: 2023 },
  { title: 'Soft Static', artist: 'Lantern Bay', year: 2025 }
];

/** 一首歌；`album` 是 `ALBUMS` 里的序号，`duration` 以秒计。 */
export interface Song {
  readonly title: string;
  readonly artist: string;
  readonly album: number;
  readonly duration: number;
}

/** 曲库里的歌，顺序即播放顺序；每首歌的音乐参数由它的序号推出。 */
export const SONGS: readonly Song[] = [
  { title: 'Aurora Drift', artist: 'Kaida', album: 0, duration: 224 },
  { title: 'Glass Cathedral', artist: 'Kaida', album: 0, duration: 191 },
  { title: 'Low Orbit', artist: 'Orbital Fold', album: 1, duration: 268 },
  { title: 'Parallax', artist: 'Orbital Fold', album: 1, duration: 205 },
  { title: 'Sunbleach', artist: 'The Vireo', album: 2, duration: 178 },
  { title: 'Ochre', artist: 'The Vireo', album: 2, duration: 243 },
  { title: 'Nightgraph', artist: 'Sable Court', album: 3, duration: 302 },
  { title: 'Velvet Static', artist: 'Sable Court', album: 3, duration: 216 },
  { title: 'Fernlight', artist: 'Moss & Marrow', album: 4, duration: 189 },
  { title: 'Soft Static', artist: 'Lantern Bay', album: 5, duration: 231 }
];

/** 「歌手」页的一格：封面沿用 `art` 号（序号 + 2，错开专辑页的配色）。 */
export interface Artist {
  readonly name: string;
  readonly album: number;
  readonly art: number;
}

/** 按专辑出现顺序去重后的歌手。 */
export const ARTISTS: readonly Artist[] = [...new Set(ALBUMS.map(album => album.artist))].map((name, index) => ({
  name,
  album: ALBUMS.findIndex(album => album.artist === name),
  art: index + 2
}));

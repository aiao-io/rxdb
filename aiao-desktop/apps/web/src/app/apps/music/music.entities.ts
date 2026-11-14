import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

// 字段一律用 `declare`：读写由 RxDB 的实体代理接管，写成 `name!: string` 在 `useDefineForClassFields` 下会
// 真的定义一个值为 `undefined` 的自有属性，把代理的取值器盖掉。

/**
 * 曲库里的一张专辑。`position`（从 0 起）同时是它的封面号（`ART` 对 12 取余）和曲风号，
 * 所以改动已有专辑的位置会改变它的封面和合成出来的音乐。
 */
@Entity({
  name: 'MusicAlbum',
  tableName: 'music_album',
  namespace: 'desktop',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'artist', type: PropertyType.string, required: true },
    { name: 'year', type: PropertyType.integer, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'music_album_position', properties: ['position'], unique: true }]
})
export class MusicAlbum extends EntityBase {
  declare title: string;
  declare artist: string;
  declare year: number;
  /** 专辑次序，从 0 起；也是封面号与曲风号。 */
  declare position: number;
}

/**
 * 曲库里的一首歌。音频是按歌曲次序现场合成的，库里只存目录信息；
 * `position`（从 0 起）既是播放顺序，也决定这首歌合成出的音符。
 */
@Entity({
  name: 'MusicTrack',
  tableName: 'music_track',
  namespace: 'desktop',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'artist', type: PropertyType.string, required: true },
    { name: 'albumId', columnName: 'album_id', type: PropertyType.string, required: true },
    { name: 'duration', type: PropertyType.integer, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'music_track_position', properties: ['position'], unique: true }]
})
export class MusicTrack extends EntityBase {
  declare title: string;
  declare artist: string;
  /** 所属专辑（{@link MusicAlbum.id}）。 */
  declare albumId: string;
  /** 时长，秒。 */
  declare duration: number;
  /** 曲库次序，从 0 起。 */
  declare position: number;
}

/** 侧栏 Playlists 下的一个歌单；目前每个歌单都直接列出整个曲库。 */
@Entity({
  name: 'MusicPlaylist',
  tableName: 'music_playlist',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'music_playlist_name', properties: ['name'], unique: true }]
})
export class MusicPlaylist extends EntityBase {
  declare name: string;
  /** 侧栏里的顺序，小的在前。 */
  declare position: number;
}

/** 音乐应用的全部实体，登记进 `DESKTOP_ENTITIES`。 */
export const MUSIC_ENTITIES: readonly EntityType[] = [MusicAlbum, MusicTrack, MusicPlaylist];

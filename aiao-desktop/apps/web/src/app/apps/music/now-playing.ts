import { Service, signal } from '@angular/core';

/** 正在播的歌与播放位置：整个桌面一份，关掉音乐窗口再打开，还停在上次的地方。 */
@Service({ autoProvided: false })
export class NowPlaying {
  /** 歌在曲库里的序号。 */
  readonly index = signal(0);
  /** 播放位置（秒）。 */
  readonly pos = signal(0);
}

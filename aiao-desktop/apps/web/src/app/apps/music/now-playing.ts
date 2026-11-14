import { Service, signal } from '@angular/core';

/**
 * 正在播的歌与播放位置：整个桌面一份，关掉音乐窗口再打开，还停在上次的地方。
 * 这是运行时状态，不进本地库：刷新页面后回到曲库的第一首、从头开始。
 */
@Service({ autoProvided: false })
export class NowPlaying {
  /** 歌在曲库里的序号（曲库按 `position` 排序）。 */
  readonly index = signal(0);
  /** 播放位置（秒）。 */
  readonly pos = signal(0);
}

import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { combineLatest, map } from 'rxjs';

import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { SystemState } from '../../services/system-state';
import { clamp, mmss } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Slider } from '../../shared/slider';
import { TrafficLights } from '../../shared/traffic-lights';
import { AlbumArt } from './album-art';
import { EMPTY_LIBRARY, SongRow, buildLibrary } from './music-model';
import { MusicAlbum, MusicPlaylist, MusicTrack } from './music.entities';
import { NowPlaying } from './now-playing';
import { Synth } from './synth';

interface SidebarGroup {
  readonly head: string;
  readonly items: readonly (readonly [name: string, icon: string])[];
}

/** 侧栏里固定的两组；第三组 Playlists 来自库里的歌单。 */
const SIDEBAR_FIXED: readonly SidebarGroup[] = [
  {
    head: 'Apple Music',
    items: [
      ['Home', 'g-globe'],
      ['New', 'g-star'],
      ['Radio', 'g-airplay']
    ]
  },
  {
    head: 'Library',
    items: [
      ['Recently Added', 'g-clock-a'],
      ['Artists', 'g-hand'],
      ['Albums', 'g-grid'],
      ['Songs', 'g-list'],
      ['Made for You', 'g-star']
    ]
  }
];

const MENU_ORDER = ['File', 'Edit', 'View', 'Controls', 'Window', 'Help'];

type MusicBody = 'search' | 'songs' | 'artists' | 'albums';

/**
 * 音乐：侧栏浏览、搜索，以及真的会响的播放器（Web Audio 合成）。
 * 专辑、歌曲与歌单存在本地库里；正在播的歌与播放位置只是运行时状态（见 {@link NowPlaying}）。
 */
@Component({
  selector: 'app-music',
  imports: [AlbumArt, Icon, Slider, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './music.html'
})
export class MusicApp {
  private readonly win = inject(DesktopWindow);
  private readonly nowPlaying = inject(NowPlaying);
  private readonly synth = new Synth();
  /** 专辑与歌曲一起读：两边都到齐才发出，曲库里不会出现指向未读到专辑的歌。 */
  private readonly library = liveQuery(
    () =>
      combineLatest([
        MusicAlbum.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
        MusicTrack.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] })
      ]).pipe(map(([albums, tracks]) => buildLibrary(albums, tracks))),
    EMPTY_LIBRARY,
    MusicAlbum
  );
  private readonly playlists = liveQuery(
    () => MusicPlaylist.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    MusicPlaylist
  );
  /** 侧栏点选压入历史，前进后退才有意义。 */
  private readonly history = signal<readonly string[]>(['Recently Added']);
  /** 拖动进度条时只动标签，松手再重新起音，免得合成器每次指针移动都拆了重建。 */
  private scrubbing = false;

  protected readonly system = inject(SystemState);
  protected readonly albums = computed(() => this.library().albums);
  protected readonly artists = computed(() => this.library().artists);
  protected readonly songs = computed(() => this.library().songs);
  protected readonly sidebar = computed<readonly SidebarGroup[]>(() => [
    ...SIDEBAR_FIXED,
    { head: 'Playlists', items: this.playlists().map(playlist => [playlist.name, 'g-list'] as const) }
  ]);
  protected readonly cursor = signal(0);
  protected readonly query = signal('');
  protected readonly index = this.nowPlaying.index;
  protected readonly pos = this.nowPlaying.pos;
  protected readonly playing = signal(false);
  protected readonly shuffle = signal(false);
  protected readonly repeat = signal(false);
  protected readonly picked = signal<number | null>(null);
  protected readonly seekValue = signal(0);

  protected readonly view = computed(() => this.history()[this.cursor()]);
  protected readonly canGoBack = computed(() => this.cursor() > 0);
  protected readonly canGoForward = computed(() => this.cursor() < this.history().length - 1);
  /** 正在播的歌；曲库还没读到时没有。 */
  protected readonly song = computed<SongRow | undefined>(() => this.songs()[this.index()]);
  protected readonly duration = computed(() => this.song()?.duration ?? 0);
  protected readonly elapsed = computed(() => mmss(this.pos()));
  protected readonly remaining = computed(() => `-${mmss(Math.max(0, this.duration() - this.pos()))}`);

  /** 输入的搜索词优先于侧栏，和在音乐里打字会跳到结果一样；歌单与 Songs 一样直接列出整个曲库。 */
  protected readonly body = computed<MusicBody>(() => {
    if (this.query()) return 'search';
    const view = this.view();
    if (view === 'Songs' || this.playlists().some(playlist => playlist.name === view)) return 'songs';
    return view === 'Artists' ? 'artists' : 'albums';
  });
  protected readonly rows = computed(() => {
    const query = this.query();
    const songs = this.songs();
    return query ? songs.filter(row => row.haystack.includes(query)) : songs;
  });
  protected readonly title = computed(() => (this.query() ? `Search: ${this.query()}` : this.view()));
  protected readonly count = computed(() => {
    const body = this.body();
    if (body === 'search') return `${this.rows().length} result${this.rows().length === 1 ? '' : 's'}`;
    if (body === 'songs') {
      const total = this.songs().reduce((sum, song) => sum + song.duration, 0);
      return `${this.songs().length} songs · ${mmss(total)}`;
    }
    return body === 'artists' ? `${this.artists().length} artists` : `${this.albums().length} albums`;
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard(
          'music',
          {
            Controls: [
              { id: 'p', label: 'Play', key: '␣', run: () => this.toggle() },
              { id: 'n', label: 'Next', key: '⌘→', run: () => this.skip(1) },
              { id: 'b', label: 'Previous', key: '⌘←', run: () => this.skip(-1) },
              '-',
              { id: 's', label: 'Shuffle', key: '⌘S' },
              { id: 'r', label: 'Repeat', key: '⌘R' }
            ]
          },
          MENU_ORDER
        )
      )
    );
    this.win.beforeClose.subscribe(() => this.stopAll());

    effect(() => this.synth.setLevel(this.system.volume(), this.system.muted()));
    /* 进度条的旋钮跟着播放位置走；拖动期间由指针说了算。 */
    effect(() => {
      const duration = this.duration();
      const fraction = duration ? this.pos() / duration : 0;
      untracked(() => {
        if (!this.scrubbing) this.seekValue.set(fraction);
      });
    });

    /* 走带：播放时读音频时钟，只有浏览器完全没有 AudioContext 时才按墙钟一秒一秒加。 */
    const timer = setInterval(() => this.advance(), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.synth.dispose();
    });
  }

  protected open(name: string): void {
    this.history.update(history => [...history.slice(0, this.cursor() + 1), name]);
    this.cursor.set(this.history().length - 1);
    this.picked.set(null);
  }

  protected navigate(step: number): void {
    this.cursor.set(clamp(this.cursor() + step, 0, this.history().length - 1));
    this.picked.set(null);
  }

  protected find(text: string): void {
    this.query.set(text.trim().toLowerCase());
    this.picked.set(null);
  }

  protected toggle(): void {
    if (!this.song()) return;
    const playing = !this.playing();
    this.playing.set(playing);
    if (playing) this.startSynth(this.pos());
    else {
      this.pos.set(this.synth.position() ?? this.pos());
      this.synth.stop();
    }
    this.picked.set(null);
  }

  protected play(index: number, from = 0): void {
    this.index.set(clamp(index, 0, this.songs().length - 1));
    this.pos.set(from);
    this.playing.set(true);
    this.startSynth(from);
    this.picked.set(null);
  }

  protected playAlbum(album: number): void {
    const first = this.songs().findIndex(song => song.album === album);
    this.play(first < 0 ? 0 : first);
  }

  protected skip(step: number): void {
    const count = this.songs().length;
    if (count) this.play((this.index() + step + count) % count);
  }

  protected scrub(fraction: number): void {
    this.scrubbing = true;
    this.pos.set(clamp(fraction, 0, 0.999) * this.duration());
  }

  /** 松手后从离落点最近的小节线接着播。 */
  protected seekTo(fraction: number): void {
    const at = clamp(fraction, 0, 0.999) * this.duration();
    this.scrubbing = false;
    this.pos.set(at);
    if (this.playing()) this.startSynth(at);
  }

  /** 合成器按歌曲序号和所属专辑的次序推出音符。 */
  private startSynth(from: number): void {
    const song = this.song();
    if (song) this.synth.start(this.index(), song.album, from);
  }

  private stopAll(): void {
    this.playing.set(false);
    this.synth.stop();
  }

  private advance(): void {
    if (!this.playing()) return;
    this.pos.set(this.synth.position() ?? this.pos() + 1);
    if (this.pos() >= this.duration()) this.skip(1);
  }
}

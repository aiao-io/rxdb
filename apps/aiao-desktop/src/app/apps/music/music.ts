import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { SystemState } from '../../services/system-state';
import { clamp, mmss } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Slider } from '../../shared/slider';
import { TrafficLights } from '../../shared/traffic-lights';
import { AlbumArt } from './album-art';
import { ALBUMS, ARTISTS, SONGS } from './music-data';
import { Synth } from './synth';

interface SidebarGroup {
  readonly head: string;
  readonly items: readonly (readonly [name: string, icon: string])[];
}

const SIDEBAR: readonly SidebarGroup[] = [
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
  },
  {
    head: 'Playlists',
    items: [
      ['Focus', 'g-list'],
      ['Late Night', 'g-list'],
      ['Shipping Music', 'g-list']
    ]
  }
];

const MENU_ORDER = ['File', 'Edit', 'View', 'Controls', 'Window', 'Help'];
const TOTAL_SECONDS = SONGS.reduce((sum, song) => sum + song.duration, 0);
/** 这几页都直接列出整个曲库（以 `Focus` 开头的也算）。 */
const SONG_VIEWS = ['Songs', 'Late Night', 'Shipping Music'];

type MusicBody = 'search' | 'songs' | 'artists' | 'albums';

/** 曲库里的一行：`index` 是它在 `SONGS` 里的序号，`haystack` 是搜索时匹配的文本。 */
interface SongRow {
  readonly index: number;
  readonly title: string;
  readonly album: number;
  readonly detail: string;
  readonly time: string;
  readonly haystack: string;
}

const ROWS: readonly SongRow[] = SONGS.map((song, index) => ({
  index,
  title: song.title,
  album: song.album,
  detail: `${song.artist} — ${ALBUMS[song.album].title}`,
  time: mmss(song.duration),
  haystack: `${song.title} ${song.artist} ${ALBUMS[song.album].title}`.toLowerCase()
}));

/** 音乐：侧栏浏览、搜索，以及真的会响的播放器（Web Audio 合成）。 */
@Component({
  selector: 'app-music',
  imports: [AlbumArt, Icon, Slider, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './music.html'
})
export class MusicApp {
  private readonly win = inject(DesktopWindow);
  private readonly synth = new Synth();
  /** 侧栏点选压入历史，前进后退才有意义。 */
  private readonly history = signal<readonly string[]>(['Recently Added']);
  /** 拖动进度条时只动标签，松手再重新起音，免得合成器每次指针移动都拆了重建。 */
  private scrubbing = false;

  protected readonly system = inject(SystemState);
  protected readonly sidebar = SIDEBAR;
  protected readonly albums = ALBUMS;
  protected readonly artists = ARTISTS;
  protected readonly cursor = signal(0);
  protected readonly query = signal('');
  protected readonly index = signal(0);
  protected readonly pos = signal(0);
  protected readonly playing = signal(false);
  protected readonly shuffle = signal(false);
  protected readonly repeat = signal(false);
  protected readonly picked = signal<number | null>(null);
  protected readonly seekValue = signal(0);

  protected readonly view = computed(() => this.history()[this.cursor()]);
  protected readonly canGoBack = computed(() => this.cursor() > 0);
  protected readonly canGoForward = computed(() => this.cursor() < this.history().length - 1);
  protected readonly song = computed(() => SONGS[this.index()]);
  protected readonly detail = computed(() => `${this.song().artist} — ${ALBUMS[this.song().album].title}`);
  protected readonly elapsed = computed(() => mmss(this.pos()));
  protected readonly remaining = computed(() => `-${mmss(Math.max(0, this.song().duration - this.pos()))}`);

  /** 输入的搜索词优先于侧栏，和在音乐里打字会跳到结果一样。 */
  protected readonly body = computed<MusicBody>(() => {
    if (this.query()) return 'search';
    const view = this.view();
    if (SONG_VIEWS.includes(view) || view.startsWith('Focus')) return 'songs';
    return view === 'Artists' ? 'artists' : 'albums';
  });
  protected readonly rows = computed(() => {
    const query = this.query();
    return query ? ROWS.filter(row => row.haystack.includes(query)) : ROWS;
  });
  protected readonly title = computed(() => (this.query() ? `Search: ${this.query()}` : this.view()));
  protected readonly count = computed(() => {
    const body = this.body();
    if (body === 'search') return `${this.rows().length} result${this.rows().length === 1 ? '' : 's'}`;
    if (body === 'songs') return `${SONGS.length} songs · ${mmss(TOTAL_SECONDS)}`;
    return body === 'artists' ? `${ARTISTS.length} artists` : `${ALBUMS.length} albums`;
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
      const fraction = this.pos() / this.song().duration;
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
    const playing = !this.playing();
    this.playing.set(playing);
    if (playing) this.synth.start(this.index(), this.pos());
    else {
      this.pos.set(this.synth.position() ?? this.pos());
      this.synth.stop();
    }
    this.picked.set(null);
  }

  protected play(index: number, from = 0): void {
    this.index.set(clamp(index, 0, SONGS.length - 1));
    this.pos.set(from);
    this.playing.set(true);
    this.synth.start(this.index(), from);
    this.picked.set(null);
  }

  protected playAlbum(album: number): void {
    const first = SONGS.findIndex(song => song.album === album);
    this.play(first < 0 ? 0 : first);
  }

  protected skip(step: number): void {
    this.play((this.index() + step + SONGS.length) % SONGS.length);
  }

  protected scrub(fraction: number): void {
    this.scrubbing = true;
    this.pos.set(clamp(fraction, 0, 0.999) * this.song().duration);
  }

  /** 松手后从离落点最近的小节线接着播。 */
  protected seekTo(fraction: number): void {
    const at = clamp(fraction, 0, 0.999) * this.song().duration;
    this.scrubbing = false;
    this.pos.set(at);
    if (this.playing()) this.synth.start(this.index(), at);
  }

  private stopAll(): void {
    this.playing.set(false);
    this.synth.stop();
  }

  private advance(): void {
    if (!this.playing()) return;
    this.pos.set(this.synth.position() ?? this.pos() + 1);
    if (this.pos() >= this.song().duration) this.skip(1);
  }
}

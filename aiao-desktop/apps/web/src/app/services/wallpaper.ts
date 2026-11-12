import { DOCUMENT } from '@angular/common';
import { Service, WritableSignal, inject, signal } from '@angular/core';

import { SystemState, WallpaperKey } from './system-state';
import { Toast } from './toast';

export interface WallpaperInfo {
  readonly name: string;
  /** 取样前的菜单栏墨色；取样结果通常就是它，所以加载时菜单栏不会闪。 */
  readonly ink: 'dark' | 'light';
  readonly url: string;
}

export const WALLPAPERS: Readonly<Record<WallpaperKey, WallpaperInfo>> = {
  tahoe: {
    name: 'Alpine Lake',
    ink: 'dark',
    url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=85&w=3200&auto=format&fit=crop'
  },
  ridges: {
    name: 'Blue Ridges',
    ink: 'dark',
    url: 'https://images.unsplash.com/photo-1490604001847-b712b0c2f967?q=85&w=3200&auto=format&fit=crop'
  },
  summit: {
    name: 'Above Clouds',
    ink: 'dark',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=85&w=3200&auto=format&fit=crop'
  },
  valley: {
    name: 'Glacier Bay',
    ink: 'dark',
    url: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?q=85&w=3200&auto=format&fit=crop'
  },
  forest: {
    name: 'Redwoods',
    ink: 'light',
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=85&w=3200&auto=format&fit=crop'
  },
  night: {
    name: 'Night Sky',
    ink: 'light',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=85&w=3200&auto=format&fit=crop'
  }
};

export const WALLPAPER_KEYS = Object.keys(WALLPAPERS) as WallpaperKey[];

/** 同一张图的小尺寸版本：设置面板也用它，所以通常已在缓存里。 */
export const wallpaperThumb = (info: WallpaperInfo, width = 640): string => info.url.replace('w=3200', `w=${width}`);

export interface WallpaperLayer {
  readonly id: number;
  readonly key: WallpaperKey;
  readonly src: string;
  readonly full: boolean;
  readonly on: WritableSignal<boolean>;
}

/** 桌面图片的加载与淡入：每次切换领一张票，过期的加载不会覆盖新的选择。 */
@Service({ autoProvided: false })
export class WallpaperService {
  private readonly system = inject(SystemState);
  private readonly toast = inject(Toast);
  private readonly root = inject(DOCUMENT).documentElement;

  private readonly layersState = signal<readonly WallpaperLayer[]>([]);
  private gen = 0;
  private seq = 0;
  private want: WallpaperKey | null = null;
  private keep: WallpaperLayer | null = null;

  readonly layers = this.layersState.asReadonly();

  set(key: WallpaperKey): void {
    const info = WALLPAPERS[key];
    const current = this.layersState().find(layer => layer.on() && layer.full);
    this.system.wallpaper.set(key);
    if (this.want === key && current?.key === key) return;
    this.want = key;
    const ticket = ++this.gen;
    this.pickInk(info);

    let done = false;
    this.load(
      info.url,
      () => {
        done = true;
        this.paint(ticket, key, info.url, true);
      },
      () => {
        done = true;
        if (ticket === this.gen && !this.layersState().some(layer => layer.on()))
          this.toast.show(`Could not load ${info.name}`);
      }
    );
    /* 原图先跑 140ms；慢网下先用缓存里的小图顶上，模糊总比空白强。 */
    setTimeout(() => {
      if (done || ticket !== this.gen) return;
      const thumb = wallpaperThumb(info);
      this.load(thumb, () => {
        if (!done) this.paint(ticket, key, thumb, false);
      });
    }, 140);
  }

  /** 锁屏沿用桌面当前显示的图片，包括程序化渐变的兜底。 */
  liveImage(): string {
    const live = this.layersState().find(layer => layer.on());
    return `url("${live?.src ?? WALLPAPERS[this.system.wallpaper()].url}")`;
  }

  private paint(ticket: number, key: WallpaperKey, src: string, full: boolean): void {
    if (ticket !== this.gen) return;
    const layer: WallpaperLayer = { id: ++this.seq, key, src, full, on: signal(false) };
    this.layersState.update(layers => [...layers, layer]);
    this.keep = layer;
    requestAnimationFrame(() => requestAnimationFrame(() => this.reveal(layer)));
  }

  /* 按当时的 keep 收尾，而不是按闭包：淡入结束时同一张图的高清版可能已经接替。 */
  private reveal(layer: WallpaperLayer): void {
    if (this.keep !== layer) {
      this.drop(layer);
      return;
    }
    layer.on.set(true);
    setTimeout(() => this.layersState.update(layers => layers.filter(item => item === this.keep)), 800);
  }

  private drop(layer: WallpaperLayer): void {
    this.layersState.update(layers => layers.filter(item => item !== layer));
  }

  private load(src: string, ok: () => void, fail: () => void = () => undefined): void {
    const image = new Image();
    image.decoding = 'async';
    image.onerror = fail;
    image.onload = () => void image.decode().then(ok, ok);
    image.src = src;
  }

  /* AppKit 按菜单栏下方的像素挑墨色：把图缩小，平均菜单栏覆盖那一条的亮度。 */
  private pickInk(info: WallpaperInfo): void {
    this.root.dataset['mbInk'] = info.ink;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => this.sampleInk(probe);
    probe.src = info.url;
  }

  private sampleInk(probe: HTMLImageElement): void {
    const width = 48;
    const height = Math.max(2, Math.round((48 * probe.naturalHeight) / probe.naturalWidth));
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(probe, 0, 0, width, height);
    const rows = Math.max(1, Math.round(height * (26 / innerHeight)));
    try {
      const data = context.getImageData(0, 0, width, rows).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      this.root.dataset['mbInk'] = sum / (data.length / 4) / 255 > 0.55 ? 'dark' : 'light';
    } catch {
      /* 跨域污染时保留静态墨色。 */
    }
  }
}

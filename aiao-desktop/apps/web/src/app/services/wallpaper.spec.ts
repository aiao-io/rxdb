import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeDom, configureServices } from '../testing/angular';
import { stubViewport } from '../testing/browser';
import { SystemState } from './system-state';
import { Toast } from './toast';
import { WALLPAPERS, WALLPAPER_KEYS, WallpaperService, wallpaperThumb } from './wallpaper';

/** 替身 Image：不发网络请求，由用例决定何时「加载成功」或「失败」。 */
class FakeImage {
  private address = '';
  static readonly instances: FakeImage[] = [];
  decoding = '';
  crossOrigin = '';
  naturalWidth = 3200;
  naturalHeight = 2000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly decode = vi.fn(async () => undefined);

  get src(): string {
    return this.address;
  }

  set src(value: string) {
    this.address = value;
    FakeImage.instances.push(this);
  }

  get isProbe(): boolean {
    return this.crossOrigin === 'anonymous';
  }
}

/** 找到给定地址上的加载器（用来显示的那张）或探针（用来取样菜单栏墨色的那张）。 */
const imageFor = (url: string, probe = false): FakeImage => {
  const found = FakeImage.instances.find(image => image.src === url && image.isProbe === probe);
  if (!found) throw new Error(`没有为 ${url} 创建${probe ? '探针' : '加载器'}`);
  return found;
};

interface Pixels {
  readonly data: number[];
  readonly context: boolean;
  readonly tainted: boolean;
}

function stubCanvas({ data, context, tainted }: Pixels) {
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => {
    if (tainted) throw new Error('tainted canvas');
    return { data: Uint8ClampedArray.from(data) };
  });
  const canvas = { getContext: vi.fn(() => (context ? { drawImage, getImageData } : null)) };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  return { canvas, drawImage, getImageData };
}

const BRIGHT: Pixels = { data: [255, 255, 255, 255, 250, 250, 250, 255], context: true, tainted: false };
const DARK: Pixels = { data: [10, 10, 10, 255, 20, 20, 20, 255], context: true, tainted: false };

function setup(pixels: Pixels = BRIGHT) {
  FakeImage.instances.length = 0;
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  stubViewport(1440, 900);
  const canvas = stubCanvas(pixels);
  const toast = { show: vi.fn() };
  const dom = configureServices([WallpaperService, SystemState, { provide: Toast, useValue: toast }]);
  return { wallpaper: TestBed.inject(WallpaperService), system: TestBed.inject(SystemState), toast, dom, canvas };
}

/** 模拟浏览器把图加载好：触发 onload，再让 decode 的回调跑完。 */
async function finishLoading(url: string): Promise<void> {
  imageFor(url).onload?.();
  await vi.advanceTimersByTimeAsync(0);
}

const live = (wallpaper: WallpaperService) => wallpaper.layers().filter(layer => layer.on());
const inkOf = (dom: FakeDom): string | undefined => dom.root.dataset['mbInk'];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('壁纸表', () => {
  it('六张壁纸，缩略图用同一张图的小尺寸版本', () => {
    expect(WALLPAPER_KEYS).toEqual(['tahoe', 'ridges', 'summit', 'valley', 'forest', 'night']);
    expect(wallpaperThumb(WALLPAPERS.tahoe)).toContain('w=640');
    expect(wallpaperThumb(WALLPAPERS.tahoe)).not.toContain('w=3200');
    expect(wallpaperThumb(WALLPAPERS.tahoe, 320)).toContain('w=320');
  });
});

describe('WallpaperService 切换壁纸', () => {
  it('没有加载好的图时，锁屏用当前选择的壁纸地址', () => {
    const { wallpaper } = setup();
    expect(wallpaper.layers()).toEqual([]);
    expect(wallpaper.liveImage()).toBe(`url("${WALLPAPERS.tahoe.url}")`);
  });

  it('set 立即记下选择，并按壁纸预设的墨色设置菜单栏；原图加载好后淡入成为当前图层', async () => {
    const { wallpaper, system, dom } = setup();
    wallpaper.set('forest');
    expect(system.wallpaper()).toBe('forest');
    expect(inkOf(dom)).toBe('light');

    await finishLoading(WALLPAPERS.forest.url);
    expect(wallpaper.layers()).toHaveLength(1);
    expect(wallpaper.layers()[0]).toMatchObject({ key: 'forest', full: true, src: WALLPAPERS.forest.url });
    expect(live(wallpaper)).toEqual([]);

    await vi.advanceTimersByTimeAsync(32);
    expect(live(wallpaper)).toHaveLength(1);
    expect(wallpaper.liveImage()).toBe(`url("${WALLPAPERS.forest.url}")`);
  });

  it('换壁纸后旧图层淡入完成 800ms 后移除，只留新的', async () => {
    const { wallpaper } = setup();
    wallpaper.set('tahoe');
    await finishLoading(WALLPAPERS.tahoe.url);
    await vi.advanceTimersByTimeAsync(900);
    expect(wallpaper.layers().map(layer => layer.key)).toEqual(['tahoe']);

    wallpaper.set('night');
    await finishLoading(WALLPAPERS.night.url);
    await vi.advanceTimersByTimeAsync(32);
    expect(wallpaper.layers().map(layer => layer.key)).toEqual(['tahoe', 'night']);
    await vi.advanceTimersByTimeAsync(800);
    expect(wallpaper.layers().map(layer => layer.key)).toEqual(['night']);
  });

  it('已经显示着同一张壁纸时再 set 不重复加载', async () => {
    const { wallpaper } = setup();
    wallpaper.set('tahoe');
    await finishLoading(WALLPAPERS.tahoe.url);
    await vi.advanceTimersByTimeAsync(900);
    const created = FakeImage.instances.length;

    wallpaper.set('tahoe');
    expect(FakeImage.instances).toHaveLength(created);
  });

  it('慢网下 140ms 后先用缓存里的小图顶上，原图到了再接替，淡入完成后小图层被移除', async () => {
    const { wallpaper } = setup();
    wallpaper.set('summit');
    await vi.advanceTimersByTimeAsync(140);
    const thumb = wallpaperThumb(WALLPAPERS.summit);
    await finishLoading(thumb);
    expect(wallpaper.layers()).toMatchObject([{ key: 'summit', full: false, src: thumb }]);

    await vi.advanceTimersByTimeAsync(32);
    await finishLoading(WALLPAPERS.summit.url);
    await vi.advanceTimersByTimeAsync(32);
    expect(wallpaper.layers().map(layer => layer.full)).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(800);
    expect(wallpaper.layers().map(layer => layer.full)).toEqual([true]);
    expect(wallpaper.liveImage()).toBe(`url("${WALLPAPERS.summit.url}")`);
  });

  it('原图在 140ms 内到了就不再请求小图；原图先到后小图晚到也不显示', async () => {
    const { wallpaper } = setup();
    wallpaper.set('valley');
    await vi.advanceTimersByTimeAsync(100);
    await finishLoading(WALLPAPERS.valley.url);
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeImage.instances.some(image => image.src === wallpaperThumb(WALLPAPERS.valley))).toBe(false);
  });

  it('过期的加载不会覆盖新的选择', async () => {
    const { wallpaper, system } = setup();
    wallpaper.set('forest');
    wallpaper.set('night');
    await finishLoading(WALLPAPERS.night.url);
    await finishLoading(WALLPAPERS.forest.url);
    await vi.advanceTimersByTimeAsync(900);
    expect(system.wallpaper()).toBe('night');
    expect(wallpaper.layers().map(layer => layer.key)).toEqual(['night']);
  });

  it('加载失败且屏幕上还没有图时提示；已经有图在显示就不打扰', async () => {
    const { wallpaper, toast } = setup();
    wallpaper.set('ridges');
    imageFor(WALLPAPERS.ridges.url).onerror?.();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Could not load Blue Ridges');

    wallpaper.set('tahoe');
    await finishLoading(WALLPAPERS.tahoe.url);
    await vi.advanceTimersByTimeAsync(40);
    wallpaper.set('forest');
    imageFor(WALLPAPERS.forest.url).onerror?.();
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it('失败的加载不会让「正在加载」永远占着：之后重新选同一张壁纸会再次加载', async () => {
    const { wallpaper } = setup();
    wallpaper.set('forest');
    imageFor(WALLPAPERS.forest.url).onerror?.();
    const created = FakeImage.instances.length;
    wallpaper.set('forest');
    expect(FakeImage.instances.length).toBeGreaterThan(created);
  });
});

describe('WallpaperService 菜单栏墨色', () => {
  it('按菜单栏下方那一条的平均亮度取样：亮图用深色字，暗图用浅色字', async () => {
    const bright = setup(BRIGHT);
    bright.wallpaper.set('forest');
    imageFor(WALLPAPERS.forest.url, true).onload?.();
    expect(inkOf(bright.dom)).toBe('dark');
    expect(bright.canvas.drawImage).toHaveBeenCalledTimes(1);

    const dark = setup(DARK);
    dark.wallpaper.set('tahoe');
    imageFor(WALLPAPERS.tahoe.url, true).onload?.();
    expect(inkOf(dark.dom)).toBe('light');
  });

  it('取样用的画布按宽 48 缩小，高度保持原图比例', () => {
    const { wallpaper, canvas } = setup();
    wallpaper.set('tahoe');
    const probe = imageFor(WALLPAPERS.tahoe.url, true);
    probe.naturalWidth = 4800;
    probe.naturalHeight = 2400;
    probe.onload?.();
    expect(canvas.drawImage).toHaveBeenCalledExactlyOnceWith(probe, 0, 0, 48, 24);
  });

  it('画布不可用，或图片跨域污染了画布时，保留预设的墨色', () => {
    const noContext = setup({ ...BRIGHT, context: false });
    noContext.wallpaper.set('night');
    imageFor(WALLPAPERS.night.url, true).onload?.();
    expect(inkOf(noContext.dom)).toBe('light');

    const tainted = setup({ ...BRIGHT, tainted: true });
    tainted.wallpaper.set('tahoe');
    imageFor(WALLPAPERS.tahoe.url, true).onload?.();
    expect(inkOf(tainted.dom)).toBe('dark');
  });
});

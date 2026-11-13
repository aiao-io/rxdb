import { EnvironmentInjector, createComponent } from '@angular/core';

import { ImageEncoder, SeedImage } from '../disk/disk-seed';
import { PhotoArt } from '../shared/photo-art';

const SVG = 'http://www.w3.org/2000/svg';

function shape(name: string, attributes: Readonly<Record<string, string | number>>): SVGElement {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

/** 截图里的桌面：半透明菜单栏、一个带红绿灯与侧栏的窗口、底部的 Dock。坐标以高为 100 的视口计。 */
function desktopChrome(width: number): SVGElement[] {
  const win = { x: width * 0.2, y: 15, w: width * 0.52, h: 58 };
  const dockWidth = width * 0.38;
  return [
    shape('rect', { x: 0, y: 0, width, height: 3.2, fill: '#ffffff', opacity: 0.45 }),
    ...[2.4, 7, 11.4, 15.2].map(x =>
      shape('rect', { x, y: 1.1, width: 3, height: 1, rx: 0.5, fill: '#1c1c1e', opacity: 0.6 })
    ),
    shape('rect', { x: win.x, y: win.y, width: win.w, height: win.h, rx: 1.4, fill: '#f6f6f8', opacity: 0.95 }),
    shape('rect', { x: win.x, y: win.y, width: win.w * 0.24, height: win.h, rx: 1.4, fill: '#e3e3e8', opacity: 0.9 }),
    ...['#ff5f57', '#febc2e', '#28c840'].map((fill, i) =>
      shape('circle', { cx: win.x + 2.6 + i * 2.4, cy: win.y + 2.6, r: 0.8, fill })
    ),
    ...[0, 1, 2, 3, 4].map(i =>
      shape('rect', {
        x: win.x + win.w * 0.3,
        y: win.y + 9 + i * 6,
        width: win.w * (0.6 - i * 0.07),
        height: 1.6,
        rx: 0.8,
        fill: '#c7c7cc'
      })
    ),
    shape('rect', {
      x: (width - dockWidth) / 2,
      y: 91,
      width: dockWidth,
      height: 7,
      rx: 2.2,
      fill: '#ffffff',
      opacity: 0.35
    }),
    ...Array.from({ length: 9 }, (_, i) =>
      shape('rect', {
        x: (width - dockWidth) / 2 + 1.4 + i * (dockWidth / 9),
        y: 92.2,
        width: 4.6,
        height: 4.6,
        rx: 1.2,
        fill: ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f'][i % 5]
      })
    )
  ];
}

/** 离屏渲染插画组件，按输出比例套一层视口；截图再叠上桌面框架。 */
function composeSvg(injector: EnvironmentInjector, image: SeedImage): string {
  const ref = createComponent(PhotoArt, { environmentInjector: injector });
  try {
    ref.setInput('index', image.scene);
    ref.setInput('kind', image.variant);
    ref.changeDetectorRef.detectChanges();
    const scene = (ref.location.nativeElement as HTMLElement).querySelector('svg');
    if (!scene) throw new Error('PhotoArt rendered no <svg>');
    const width = (100 * image.width) / image.height;
    const outer = shape('svg', { width: image.width, height: image.height, viewBox: `0 0 ${width} 100` });
    scene.removeAttribute('style');
    scene.setAttribute('width', String(width));
    scene.setAttribute('height', '100');
    outer.append(scene, ...(image.screenshot ? desktopChrome(width) : []));
    return new XMLSerializer().serializeToString(outer);
  } finally {
    ref.destroy();
  }
}

async function rasterize(markup: string, image: SeedImage): Promise<Uint8Array> {
  /* 用 data: 地址而不是 blob: 地址：桌面页面跨源隔离（COEP），WebKit 在这种页面里加载不了 blob: 的 SVG 图片
     （`Image.decode()` 以「Loading error.」拒绝，磁盘根本挂不上）；data: 地址在三个引擎里都能加载。 */
  const element = new Image(image.width, image.height);
  element.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await element.decode();
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.drawImage(element, 0, 0, image.width, image.height);
  const blob = await canvas.convertToBlob({ type: `image/${image.format}`, quality: 0.86 });
  return new Uint8Array(await blob.arrayBuffer());
}

/** 把程序化插画编码成真正的 PNG / JPEG，用于首次复制内置磁盘。 */
export const photoEncoder =
  (injector: EnvironmentInjector): ImageEncoder =>
  image =>
    rasterize(composeSvg(injector, image), image);

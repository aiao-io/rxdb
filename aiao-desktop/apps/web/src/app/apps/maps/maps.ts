import {
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { MenuEntry } from '../../services/menu';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { CUPERTINO, TILE, latAt, lonAt, tileUrl, worldX, worldY, zoomForBox } from './maps-geo';
import { PlaceSpot, samePlace } from './maps-places';
import { MapPlace } from './maps.entities';

/** Nominatim 返回的一个地点。 */
interface Place {
  readonly lat: string;
  readonly lon: string;
  readonly name?: string;
  readonly display_name: string;
  readonly boundingbox?: readonly string[];
}

/** 搜索结果面板的几种状态。 */
type MapResults =
  | { readonly status: 'searching' }
  | { readonly status: 'empty'; readonly query: string }
  | { readonly status: 'failed' }
  | { readonly status: 'hits'; readonly hits: readonly Place[] };

/** 地图左上角的地点卡片。 */
interface MapCard {
  readonly title: string;
  readonly sub: string;
}

interface TileEntry {
  readonly img: HTMLImageElement;
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** 一次拖动：起点指针、起点的世界像素坐标，以及是否真的动过。 */
interface Drag {
  readonly x: number;
  readonly y: number;
  readonly worldX: number;
  readonly worldY: number;
  moved: boolean;
}

const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
/** 点在这些浮层上不拖动也不双击缩放。 */
const OVERLAYS = '.zoom,.card,.results';

const placeName = (place: Place): string => place.name || place.display_name.split(',')[0];

const titleIs = (title: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'title' as const, operator: '=' as const, value: title }]
});

/**
 * 地图：Web Mercator 的 256px 瓦片放在一个整体平移的图层里，支持拖动、滚轮与双击缩放、搜索和落针。
 * 「Save」把当前地点收藏进本地库，收藏出现在菜单栏的 Favourites 菜单里。
 */
@Component({
  selector: 'app-maps',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './maps.html'
})
export class MapsApp {
  private readonly win = inject(DesktopWindow);
  private readonly system = inject(SystemState);
  private readonly toast = inject(Toast);
  private readonly renderer = inject(Renderer2);
  private readonly data = inject(DesktopData);
  /** 收藏的地点，按收藏先后。 */
  private readonly places = liveQuery(
    () => MapPlace.findAll({ where: ALL_ROWS, orderBy: [{ field: 'createdAt', sort: 'asc' }] }),
    []
  );
  private readonly mapBox = viewChild.required<ElementRef<HTMLElement>>('mapBox');
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');
  private readonly pin = viewChild.required<ElementRef<SVGElement>>('pin');
  private readonly tiles = new Map<string, TileEntry>();
  private z = CUPERTINO.zoom;
  private lat = CUPERTINO.lat;
  private lon = CUPERTINO.lon;
  /** 连续加载失败的瓦片数；攒到 4 个就说明没有网络。 */
  private fails = 0;
  /** 每次搜索或清空都加一，过期的响应不能再画结果。 */
  private searchSeq = 0;
  private closed = false;

  protected readonly card = signal<MapCard>({ title: CUPERTINO.title, sub: CUPERTINO.sub });
  protected readonly results = signal<MapResults | null>(null);
  protected readonly offline = signal(false);
  protected readonly placeName = placeName;

  constructor() {
    const menus = inject(DesktopMenus);
    const destroyRef = inject(DestroyRef);
    this.win.setMenus(
      computed(() =>
        menus.standard(
          'maps',
          {
            View: [
              { id: 'zi', label: 'Zoom In', key: '⌘+', run: () => this.zoom(1) },
              { id: 'zo', label: 'Zoom Out', key: '⌘-', run: () => this.zoom(-1) },
              '-',
              {
                id: 'home',
                label: 'Go to Cupertino',
                run: () => this.goto(CUPERTINO.lat, CUPERTINO.lon, CUPERTINO.zoom, CUPERTINO.title, CUPERTINO.sub)
              }
            ],
            Favourites: this.favouriteEntries()
          },
          ['File', 'Edit', 'View', 'Favourites', 'Window', 'Help']
        )
      )
    );
    destroyRef.onDestroy(() => {
      this.closed = true;
    });
    this.win.afterResize.subscribe(() => this.layout());
    /* 窗口刚创建时再等一帧，尺寸才是真的。 */
    afterNextRender(() => requestAnimationFrame(() => this.layout()));
    /* 深色主题换另一套底图：旧瓦片全部作废，按新风格重排。 */
    afterRenderEffect(() => {
      this.system.theme();
      untracked(() => this.restyle());
    });
  }

  protected zoom(dir: number, ax = 0, ay = 0): void {
    const next = clamp(this.z + dir, MIN_ZOOM, MAX_ZOOM);
    if (next === this.z) return;
    /* 让指针下的那一点不动：先换算成经纬度，缩放后再把它放回同一个屏幕位置。 */
    const px = worldX(this.lon, this.z) + ax;
    const py = worldY(this.lat, this.z) + ay;
    const anchorLat = latAt(py, this.z);
    const anchorLon = lonAt(px, this.z);
    this.z = next;
    this.lon = lonAt(worldX(anchorLon, next) - ax, next);
    this.lat = latAt(clamp(worldY(anchorLat, next) - ay, 0, TILE * (1 << next)), next);
    this.layout();
  }

  protected down(event: PointerEvent): void {
    if ((event.target as Element).closest(OVERLAYS)) return;
    const box = this.mapBox().nativeElement;
    box.setPointerCapture(event.pointerId);
    const drag: Drag = {
      x: event.clientX,
      y: event.clientY,
      worldX: worldX(this.lon, this.z),
      worldY: worldY(this.lat, this.z),
      moved: false
    };
    const stopMove = this.renderer.listen(box, 'pointermove', (move: PointerEvent) => this.pan(drag, move));
    const stopUp = this.renderer.listen(box, 'pointerup', () => {
      stopMove();
      stopUp();
      if (drag.moved) this.card.set({ title: 'Dropped Pin', sub: `${this.lat.toFixed(4)}, ${this.lon.toFixed(4)}` });
    });
  }

  /** 滚轮以指针为中心缩放，和所有地图一样。 */
  protected wheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomAt(event, event.deltaY < 0 ? 1 : -1);
  }

  protected doubleClick(event: MouseEvent): void {
    if ((event.target as Element).closest(OVERLAYS)) return;
    this.zoomAt(event, 1);
  }

  protected directions(): void {
    this.toast.show(`Routing to ${this.card().title} isn't in this build`);
  }

  protected save(): void {
    const { title, sub } = this.card();
    void this.keep({ title, subtitle: sub, latitude: this.lat, longitude: this.lon, zoom: this.z });
    this.toast.show(`${title} added to Favourites`);
  }

  protected find(event: Event, field: HTMLInputElement): void {
    event.preventDefault();
    void this.search(field.value.trim());
  }

  protected dismiss(field: HTMLInputElement): void {
    field.value = '';
    this.clearResults();
  }

  protected pick(place: Place): void {
    const zoom = place.boundingbox ? zoomForBox(place.boundingbox.map(Number)) : 15;
    this.goto(
      +place.lat,
      +place.lon,
      zoom,
      placeName(place),
      place.display_name.split(',').slice(1, 4).join(',').trim()
    );
    this.clearResults();
  }

  /** 收藏一处地点；库里已经有同一处就不重复添加。 */
  private async keep(spot: PlaceSpot): Promise<void> {
    await this.data.transaction(async executor => {
      const places = executor.getRepository(MapPlace);
      const sameTitle = await places.find({ where: titleIs(spot.title) });
      if (sameTitle.some(place => samePlace(place, spot))) return;
      await places.create(this.data.instantiate(MapPlace, spot));
    });
  }

  /** 菜单栏 Favourites 菜单：每处收藏一项，点了回到那里。 */
  private favouriteEntries(): MenuEntry[] {
    const places = this.places();
    if (!places.length) return [{ id: 'none', label: 'No favourites yet', disabled: true }];
    return places.map(place => ({
      id: place.id,
      label: place.title,
      run: () => this.goto(place.latitude, place.longitude, place.zoom, place.title, place.subtitle)
    }));
  }

  private zoomAt(event: MouseEvent, dir: number): void {
    const rect = this.mapBox().nativeElement.getBoundingClientRect();
    this.zoom(dir, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
  }

  private pan(drag: Drag, event: PointerEvent): void {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    this.lon = lonAt(drag.worldX - dx, this.z);
    this.lat = latAt(clamp(drag.worldY - dy, 0, TILE * (1 << this.z)), this.z);
    this.layout();
  }

  private goto(lat: number, lon: number, zoom: number, title: string, sub: string): void {
    this.lat = lat;
    this.lon = lon;
    if (zoom) this.z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.layout();
    if (title) this.card.set({ title, sub });
    /* 重放一遍落针动画，到达才看得见。 */
    const pin = this.pin().nativeElement;
    pin.style.animation = 'none';
    requestAnimationFrame(() => {
      pin.style.animation = '';
    });
  }

  private restyle(): void {
    this.tiles.forEach(tile => tile.img.remove());
    this.tiles.clear();
    this.layout();
  }

  private layout(): void {
    if (this.closed) return;
    const box = this.mapBox().nativeElement;
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (!width || !height) return;

    /* 视口左上角的世界像素坐标。 */
    const left = worldX(this.lon, this.z) - width / 2;
    const top = worldY(this.lat, this.z) - height / 2;
    /* 视口外各多留一格，拖动时露出来的是已加载的地图而不是底色。 */
    const range = {
      x0: Math.floor(left / TILE) - 1,
      x1: Math.floor((left + width) / TILE) + 1,
      y0: Math.floor(top / TILE) - 1,
      y1: Math.floor((top + height) / TILE) + 1
    };
    /* 亚像素偏移留在图层上，整块瓦片按网格摆放。 */
    this.renderer.setStyle(
      this.pane().nativeElement,
      'transform',
      `translate3d(${-Math.round(left)}px,${-Math.round(top)}px,0)`
    );
    this.fill(range);
    this.prune(range);
  }

  private fill(range: { x0: number; x1: number; y0: number; y1: number }): void {
    const rows = 1 << this.z;
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = Math.max(range.y0, 0); y <= Math.min(range.y1, rows - 1); y++) this.ensureTile(x, y);
    }
  }

  private ensureTile(x: number, y: number): void {
    const z = this.z;
    const columns = 1 << z;
    const wrapped = ((x % columns) + columns) % columns; // 东西向绕地球一圈
    const key = `${z}/${wrapped}/${y}/${x}`;
    if (this.tiles.has(key)) return;

    const img: HTMLImageElement = this.renderer.createElement('img');
    this.renderer.setAttribute(img, 'alt', '');
    this.renderer.setStyle(img, 'left', `${x * TILE}px`);
    this.renderer.setStyle(img, 'top', `${y * TILE}px`);
    this.renderer.listen(img, 'load', () => {
      this.renderer.addClass(img, 'in');
      this.online(true);
    });
    this.renderer.listen(img, 'error', () => {
      img.remove();
      if (this.tiles.get(key)?.img === img) this.tiles.delete(key);
      this.online(false);
    });
    img.src = tileUrl(wrapped, y, z, this.system.theme() === 'dark', devicePixelRatio > 1);
    this.renderer.appendChild(this.pane().nativeElement, img);
    this.tiles.set(key, { img, z, x, y });
  }

  /** 丢掉滚出视野很远的瓦片，以及上一级缩放的全部瓦片，图层才不会无限长大。 */
  private prune(range: { x0: number; x1: number; y0: number; y1: number }): void {
    for (const [key, tile] of this.tiles) {
      const far = tile.x < range.x0 - 2 || tile.x > range.x1 + 2 || tile.y < range.y0 - 2 || tile.y > range.y1 + 2;
      if (tile.z === this.z && !far) continue;
      tile.img.remove();
      this.tiles.delete(key);
    }
  }

  /** 瓦片成批失败就是没有网络，说一次就够。 */
  private online(ok: boolean): void {
    if (this.closed) return;
    if (ok) {
      this.fails = 0;
      this.offline.set(false);
      return;
    }
    if (++this.fails >= 4) this.offline.set(true);
  }

  private clearResults(): void {
    this.searchSeq++;
    this.results.set(null);
  }

  /** Nominatim 是 OpenStreetMap 自己的地理编码，无需密钥、开放 CORS；按它的使用政策，只在回车时查一次。 */
  private async search(query: string): Promise<void> {
    if (!query) return;
    this.clearResults();
    const seq = this.searchSeq;
    this.results.set({ status: 'searching' });
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' } }
      );
      const hits = (await response.json()) as readonly Place[];
      if (this.closed || seq !== this.searchSeq) return;
      this.results.set(hits.length ? { status: 'hits', hits } : { status: 'empty', query });
    } catch {
      if (!this.closed && seq === this.searchSeq) this.results.set({ status: 'failed' });
    }
  }
}

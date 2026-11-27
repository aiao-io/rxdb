import { useI18n } from '@aiao/rxdb-i18n-angular';
import {
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { Preferences } from '../../data/preferences';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { MenuEntry } from '../../services/menu';
import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Toast } from '../../services/toast';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  CUPERTINO,
  TILE,
  arrowDelta,
  latAt,
  lonAt,
  pointLatLon,
  tileUrl,
  worldX,
  worldY,
  zoomForBox
} from './maps-geo';
import { PlaceSpot, samePlace } from './maps-places';
import { isPlaceSpotList, recordRecent, suggestRecent } from './maps-suggest';
import { MapPlace } from './maps.entities';

import { Place, searchPlaces } from './maps-search';

/** 搜索结果面板的几种状态。 */
type MapResults =
  | { readonly status: 'searching' }
  | { readonly status: 'empty'; readonly query: string }
  | { readonly status: 'failed'; readonly query: string }
  | { readonly status: 'hits'; readonly hits: readonly Place[] };

/** 输入中的建议面板：最近地点 + 远程命中。 */
type SuggestPanel = {
  readonly status: 'hits';
  readonly query: string;
  readonly recent: readonly PlaceSpot[];
  readonly hits: readonly Place[];
  readonly loading: boolean;
};

/** 最近地点的偏好键。 */
const RECENT_KEY = 'maps:recent';
/** 建议请求的防抖（Nominatim 使用政策：只在输入停顿后查一次）。 */
const SUGGEST_DELAY = 500;
/** 至少两个字符才发建议请求。 */
const SUGGEST_MIN = 2;

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
const OVERLAYS = '.zoom,.card,.results,.offline';

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
  private readonly popover = inject(PopoverService);
  private readonly preferences = inject(Preferences);
  private readonly mapBox = viewChild.required<ElementRef<HTMLElement>>('mapBox');
  /** 收藏的地点，按收藏先后。 */
  private readonly places = liveQuery(
    () => MapPlace.findAll({ where: ALL_ROWS, orderBy: [{ field: 'createdAt', sort: 'asc' }] }),
    [],
    MapPlace
  );
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');
  private readonly pin = viewChild.required<ElementRef<SVGElement>>('pin');
  private readonly tiles = new Map<string, TileEntry>();
  private z = CUPERTINO.zoom;
  private lat = CUPERTINO.lat;
  private lon = CUPERTINO.lon;
  /** 当前样式加载失败的瓦片数；资源错误不能直接当作断网。 */
  private fails = 0;
  /** 每次搜索或清空都加一，过期的响应不能再画结果。 */
  private searchSeq = 0;
  private searchController: AbortController | null = null;
  private tileGeneration = 0;
  private closed = false;
  /** 建议请求的序号与控制器：过期的响应不能顶掉新的。 */
  private suggestSeq = 0;
  private suggestTimer: ReturnType<typeof setTimeout> | undefined;
  private suggestController: AbortController | null = null;
  /** 最近使用的地点，存偏好，启动时恢复。 */
  private readonly recentState = signal<readonly PlaceSpot[]>([]);
  private readonly restoredRecent = signal(false);
  protected readonly i18n = useI18n();

  protected readonly card = signal<MapCard>({ title: CUPERTINO.title, sub: CUPERTINO.sub });
  protected readonly results = signal<MapResults | null>(null);
  protected readonly suggest = signal<SuggestPanel | null>(null);
  protected readonly offline = signal(false);
  protected readonly loadingTiles = signal(true);
  protected readonly placeName = placeName;

  constructor() {
    const menus = inject(DesktopMenus);
    const destroyRef = inject(DestroyRef);
    /* 菜单名就是 standard() 的合并键：基础菜单的键是翻译后的分区名，覆盖与顺序都要用同一份翻译。 */
    const file = this.i18n.t('shell.menu.sectionFile');
    const edit = this.i18n.t('shell.menu.sectionEdit');
    const view = this.i18n.t('shell.menu.sectionView');
    const favourites = this.i18n.t('apps.maps.sectionFavourites');
    const windowSection = this.i18n.t('shell.menu.sectionWindow');
    const help = this.i18n.t('shell.menu.sectionHelp');
    this.win.setMenus(
      computed(() =>
        menus.standard(
          'maps',
          {
            [view]: [
              { id: 'zi', label: this.i18n.t('apps.maps.zoomIn'), key: '⌘+', run: () => this.zoom(1) },
              { id: 'zo', label: this.i18n.t('apps.maps.zoomOut'), key: '⌘-', run: () => this.zoom(-1) },
              '-',
              {
                id: 'home',
                label: this.i18n.t('apps.maps.goToCupertino'),
                run: () => this.goto(CUPERTINO.lat, CUPERTINO.lon, CUPERTINO.zoom, CUPERTINO.title, CUPERTINO.sub)
              }
            ],
            [favourites]: this.favouriteEntries()
          },
          [file, edit, view, favourites, windowSection, help]
        )
      )
    );
    /* 最近地点：恢复偏好，之后每次记录写回。 */
    this.preferences.ready.then(
      () => {
        const saved = this.preferences.get(RECENT_KEY, isPlaceSpotList);
        if (saved) this.recentState.set(saved);
        this.restoredRecent.set(true);
      },
      () => undefined
    );
    effect(() => {
      const recent = this.recentState();
      if (!this.restoredRecent()) return;
      untracked(() => void this.preferences.set(RECENT_KEY, recent).catch(() => undefined));
    });
    destroyRef.onDestroy(() => {
      this.closed = true;
      this.searchController?.abort();
      this.suggestController?.abort();
      clearTimeout(this.suggestTimer);
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
      if (drag.moved)
        this.card.set({
          title: this.i18n.t('apps.maps.droppedPin'),
          sub: `${this.lat.toFixed(4)}, ${this.lon.toFixed(4)}`
        });
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
    this.toast.show(this.i18n.t('apps.maps.noRouting', { name: this.card().title }));
  }

  protected save(): void {
    const { title, sub } = this.card();
    const spot: PlaceSpot = { title, subtitle: sub, latitude: this.lat, longitude: this.lon, zoom: this.z };
    void this.keep(spot);
    this.recordSpot(spot);
    this.toast.show(this.i18n.t('apps.maps.addedToFavourites', { name: title }));
  }

  /** 方向键平移：一次一块瓦片的距离；焦点在输入框或按钮上时不动。 */
  protected key(event: KeyboardEvent): void {
    if ((event.target as Element).closest('input, button')) return;
    const delta = arrowDelta(event.key);
    if (!delta) return;
    event.preventDefault();
    this.panBy(delta[0], delta[1]);
  }

  /** 地图右键：落针、复制坐标、收藏与回 Cupertino。 */
  protected menu(event: MouseEvent): void {
    event.preventDefault();
    const box = this.mapBox().nativeElement.getBoundingClientRect();
    const point = pointLatLon(
      this.lat,
      this.lon,
      this.z,
      event.clientX - box.left - box.width / 2,
      event.clientY - box.top - box.height / 2
    );
    this.popover.contextMenu(
      event,
      [
        {
          id: 'pin',
          label: this.i18n.t('apps.maps.dropPin'),
          run: () => {
            this.lat = point.lat;
            this.lon = point.lon;
            this.card.set({
              title: this.i18n.t('apps.maps.droppedPin'),
              sub: `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`
            });
            this.layout();
          }
        },
        { id: 'copy', label: this.i18n.t('apps.maps.copyCoordinates'), run: () => void this.copyCoordinates(point) },
        '-',
        {
          id: 'save',
          label: this.i18n.t('apps.maps.saveToFavourites'),
          run: () => {
            this.lat = point.lat;
            this.lon = point.lon;
            this.save();
          }
        },
        {
          id: 'home',
          label: this.i18n.t('apps.maps.goToCupertino'),
          run: () => this.goto(CUPERTINO.lat, CUPERTINO.lon, CUPERTINO.zoom, CUPERTINO.title, CUPERTINO.sub)
        }
      ],
      this.i18n.t('apps.maps.actions')
    );
  }

  /** 输入防抖后拉取建议：最近地点即时出现，远程命中按 Nominatim 政策限频。 */
  protected input(event: Event, field: HTMLInputElement): void {
    const query = field.value.trim();
    clearTimeout(this.suggestTimer);
    if (query.length < SUGGEST_MIN) {
      this.clearSuggest();
      return;
    }
    this.suggestTimer = setTimeout(() => void this.fetchSuggest(query), SUGGEST_DELAY);
  }

  protected find(event: Event, field: HTMLInputElement): void {
    event.preventDefault();
    this.clearSuggest();
    void this.search(field.value.trim());
  }

  protected dismiss(field: HTMLInputElement): void {
    field.value = '';
    this.clearResults();
    this.clearSuggest();
  }

  protected pick(place: Place): void {
    const zoom = place.boundingbox ? zoomForBox(place.boundingbox.map(Number)) : 15;
    const title = placeName(place);
    const subtitle = place.display_name.split(',').slice(1, 4).join(',').trim();
    this.goto(+place.lat, +place.lon, zoom, title, subtitle);
    this.recordSpot({ title, subtitle, latitude: +place.lat, longitude: +place.lon, zoom });
    this.clearResults();
  }

  /** 点建议面板里的最近地点：直接回那里。 */
  protected pickRecent(spot: PlaceSpot): void {
    this.goto(spot.latitude, spot.longitude, spot.zoom, spot.title, spot.subtitle);
    this.recordSpot(spot);
    this.clearResults();
    this.clearSuggest();
  }

  /** 收藏一处地点；库里已经有同一处就不重复添加。 */
  protected retryTiles(): void {
    this.restyle();
  }

  protected retrySearch(): void {
    const panel = this.results();
    if (panel?.status === 'failed') void this.search(panel.query);
  }

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
    if (!places.length) return [{ id: 'none', label: this.i18n.t('apps.maps.noFavourites'), disabled: true }];
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
    this.tileGeneration++;
    this.fails = 0;
    this.offline.set(false);
    this.loadingTiles.set(true);
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
    const generation = this.tileGeneration;
    this.renderer.listen(img, 'load', () => {
      if (generation !== this.tileGeneration || this.closed) return;
      this.renderer.addClass(img, 'in');
      this.online(true);
    });
    this.renderer.listen(img, 'error', () => {
      if (generation !== this.tileGeneration || this.closed) return;
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

  /** 部分瓦片失败也保留提示，不能因另一张加载成功而掩盖缺失。 */
  private online(ok: boolean): void {
    if (this.closed) return;
    this.loadingTiles.set(false);
    if (!ok) this.fails++;
    this.offline.set(this.fails > 0);
  }

  private clearResults(): void {
    this.searchSeq++;
    this.searchController?.abort();
    this.searchController = null;
    this.results.set(null);
  }

  /** 按内容增量平移视图（方向键与拖动共用一套换算）。 */
  private panBy(dx: number, dy: number): void {
    this.lon = lonAt(worldX(this.lon, this.z) - dx, this.z);
    this.lat = latAt(clamp(worldY(this.lat, this.z) - dy, 0, TILE * (1 << this.z)), this.z);
    this.layout();
  }

  /** 拉取远程建议；最近地点先出现，远程命中到达后补上。 */
  private async fetchSuggest(query: string): Promise<void> {
    if (this.closed) return;
    const recent = suggestRecent(this.recentState(), query);
    this.suggestSeq++;
    const seq = this.suggestSeq;
    this.suggestController?.abort();
    const controller = new AbortController();
    this.suggestController = controller;
    this.suggest.set({ status: 'hits', query, recent, hits: [], loading: true });
    try {
      const hits = await searchPlaces(query, controller.signal);
      if (this.closed || seq !== this.suggestSeq) return;
      this.suggest.set({ status: 'hits', query, recent, hits, loading: false });
    } catch {
      if (!this.closed && seq === this.suggestSeq)
        this.suggest.set({ status: 'hits', query, recent, hits: [], loading: false });
    }
  }

  private clearSuggest(): void {
    this.suggestSeq++;
    clearTimeout(this.suggestTimer);
    this.suggestController?.abort();
    this.suggestController = null;
    this.suggest.set(null);
  }

  /** 记一次最近使用：去重移到最前，写偏好由 effect 完成。 */
  private recordSpot(spot: PlaceSpot): void {
    this.recentState.update(recent => recordRecent(recent, spot));
  }

  private async copyCoordinates(point: { lat: number; lon: number }): Promise<void> {
    const text = `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show(this.i18n.t('apps.maps.coordinatesCopied'));
    } catch {
      this.toast.show(this.i18n.t('error.maps.copyFailed', { coords: text }));
    }
  }

  /** Nominatim 是 OpenStreetMap 自己的地理编码，无需密钥、开放 CORS；按它的使用政策，只在回车时查一次。 */
  private async search(query: string): Promise<void> {
    if (!query) return;
    this.clearResults();
    const seq = this.searchSeq;
    this.results.set({ status: 'searching' });
    const controller = new AbortController();
    this.searchController = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const hits = await searchPlaces(query, controller.signal);
      if (this.closed || seq !== this.searchSeq) return;
      this.results.set(hits.length ? { status: 'hits', hits } : { status: 'empty', query });
    } catch {
      if (!this.closed && seq === this.searchSeq) this.results.set({ status: 'failed', query });
    } finally {
      clearTimeout(timeout);
      if (seq === this.searchSeq) this.searchController = null;
    }
  }
}

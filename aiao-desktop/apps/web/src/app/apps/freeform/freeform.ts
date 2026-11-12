import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { SystemState } from '../../services/system-state';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { Ink, Stroke, isStroke, unsettled, visibleStrokes } from './freeform-ink';
import { FreeformStroke } from './freeform.entities';

const PENS = ['#1d1d1f', '#0a84ff', '#ff375f', '#30d158', '#ff9f0a'] as const;

const LINE_WIDTH = 3;

/** 正在画的一笔：`points` 随指针移动不断追加。 */
interface PenStroke extends Stroke {
  readonly points: [number, number][];
}

/**
 * 无边记：在画布上拖动即可画线，可换笔色、清空；窗口缩放时按新尺寸重绘全部笔迹。
 * 笔迹存在本地库里，所有无边记窗口共用同一块画板，刷新后仍在。
 */
@Component({
  selector: 'app-freeform',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents', '(window:resize)': 'fit()' },
  template: `
    <div class="tb" data-drag>
      <div class="title">Untitled Board</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz">
        <div class="seg" data-nodrag>
          @for (color of pens; track color) {
            <button [attr.data-pen]="color" [class.on]="pen() === color" (click)="pen.set(color)" style="width: 26px">
              <span
                [style.background]="color"
                style="width: 13px; height: 13px; border-radius: 50%; display: block"
              ></span>
            </button>
          }
        </div>
        <button class="tbtn" (click)="clear()" data-clear data-nodrag title="Clear">
          <svg appIcon="g-x"></svg>
        </button>
      </div>
    </div>
    <div #stage style="flex: 1; position: relative; min-height: 0; background: var(--win)">
      <canvas
        #board
        (pointerdown)="start($event)"
        data-ff
        style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: var(--cur-cross)"
      ></canvas>
      <div
        [style.opacity]="hint()"
        data-ffhint
        style="
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
          color: var(--txt-3);
          font-size: 13px;
        "
      >
        Drag to draw
      </div>
    </div>
  `
})
export class FreeformApp {
  private readonly data = inject(DesktopData);
  private readonly system = inject(SystemState);
  /** 库里的笔迹，按落笔先后；库还没读到时为 `null`。 */
  private readonly saved = liveQuery<readonly FreeformStroke[] | null>(
    () => FreeformStroke.findAll({ where: ALL_ROWS, orderBy: [{ field: 'createdAt', sort: 'asc' }] }),
    null
  );
  /** 已松手、库还没回报的笔迹：回报之前照样画在画布上，免得闪一下。 */
  private readonly settling = signal<readonly Ink[]>([]);
  /** 指针按着、正在画。 */
  private readonly inking = signal(false);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly board = viewChild.required<ElementRef<HTMLCanvasElement>>('board');
  private readonly dpr = Math.min(2, devicePixelRatio || 1);
  private inProgress: PenStroke | null = null;
  private drawing: AbortController | null = null;

  protected readonly pens = PENS;
  protected readonly pen = signal<string>(PENS[0]);
  /** 提示语在有笔迹（或正落笔）时淡出，清空后再回来；库读到之前先藏着。 */
  protected readonly hint = computed<'0' | '1'>(() => {
    const saved = this.saved();
    return saved === null || saved.length > 0 || this.settling().length > 0 || this.inking() ? '0' : '1';
  });

  constructor() {
    const menus = inject(DesktopMenus);
    const win = inject(DesktopWindow);
    win.setMenus(computed(() => menus.standard('freeform')));
    win.afterResize.pipe(takeUntilDestroyed()).subscribe(() => this.fit());
    /* 首次渲染后量一次尺寸；之后主题切换、库里的笔迹变了（含别的窗口画的）都重新铺画布。 */
    afterRenderEffect(() => {
      this.system.theme();
      this.saved();
      this.settling();
      untracked(() => this.fit());
    });
    /* 库回报过的笔迹，就不必再靠本窗口记着的副本来画。 */
    effect(() => {
      const saved = this.saved();
      if (saved) untracked(() => this.dropSettled(saved));
    });
    inject(DestroyRef).onDestroy(() => this.finish());
  }

  /** 按容器尺寸重设画布（会清空位图），再把已有笔迹画回去。 */
  protected fit(): void {
    const { clientWidth, clientHeight } = this.stage().nativeElement;
    if (!clientWidth || !clientHeight) return;
    const canvas = this.board().nativeElement;
    canvas.width = Math.round(clientWidth * this.dpr);
    canvas.height = Math.round(clientHeight * this.dpr);
    const g = this.context();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = LINE_WIDTH;
    for (const stroke of visibleStrokes(this.saved() ?? [], this.settling(), this.inProgress)) {
      g.strokeStyle = stroke.color;
      g.beginPath();
      stroke.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }

  protected clear(): void {
    this.settling.set([]);
    void this.erase();
  }

  protected start(event: PointerEvent): void {
    this.finish();
    this.inking.set(true);
    const rect = this.board().nativeElement.getBoundingClientRect();
    const g = this.context();
    const stroke: PenStroke = { color: this.pen(), points: [[event.clientX - rect.left, event.clientY - rect.top]] };
    this.inProgress = stroke;
    g.strokeStyle = stroke.color;
    g.lineWidth = LINE_WIDTH;

    const drawing = new AbortController();
    this.drawing = drawing;
    window.addEventListener(
      'pointermove',
      move => {
        const point: [number, number] = [move.clientX - rect.left, move.clientY - rect.top];
        const [x, y] = stroke.points[stroke.points.length - 1];
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(...point);
        g.stroke();
        stroke.points.push(point);
      },
      { signal: drawing.signal }
    );
    window.addEventListener('pointerup', () => this.finish(), { signal: drawing.signal });
  }

  /** 收笔：不再跟踪指针；够成一笔就交给库保存。 */
  private finish(): void {
    this.drawing?.abort();
    this.drawing = null;
    const stroke = this.inProgress;
    this.inProgress = null;
    this.inking.set(false);
    if (stroke && isStroke(stroke)) void this.persist(stroke);
  }

  /** 存进库；落库之前先记在 `settling` 里继续画着，保存失败就撤掉这一笔并抛出错误。 */
  private async persist(stroke: Stroke): Promise<void> {
    const row = this.data.instantiate(FreeformStroke, { color: stroke.color, points: stroke.points });
    const ink: Ink = { id: row.id, color: stroke.color, points: stroke.points };
    this.settling.update(list => [...list, ink]);
    try {
      await (await this.data.repository(FreeformStroke)).create(row);
    } catch (error) {
      this.settling.update(list => list.filter(item => item !== ink));
      throw error;
    }
  }

  /** 清空画板：删掉库里的全部笔迹，所有窗口一起变空。 */
  private async erase(): Promise<void> {
    const strokes = this.saved() ?? [];
    await this.data.transaction(async executor => {
      const repository = executor.getRepository(FreeformStroke);
      for (const stroke of strokes) await repository.remove(stroke);
    });
  }

  private dropSettled(saved: readonly FreeformStroke[]): void {
    const rest = unsettled(this.settling(), saved);
    if (rest.length !== this.settling().length) this.settling.set(rest);
  }

  private context(): CanvasRenderingContext2D {
    const g = this.board().nativeElement.getContext('2d');
    if (!g) throw new Error('当前环境不支持 canvas 2d');
    return g;
  }
}

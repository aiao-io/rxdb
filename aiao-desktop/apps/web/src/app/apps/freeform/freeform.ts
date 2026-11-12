import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { SystemState } from '../../services/system-state';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

const PENS = ['#1d1d1f', '#0a84ff', '#ff375f', '#30d158', '#ff9f0a'] as const;

const LINE_WIDTH = 3;

interface Stroke {
  readonly color: string;
  readonly points: [number, number][];
}

/** 无边记：在画布上拖动即可画线，可换笔色、清空；窗口缩放时按新尺寸重绘全部笔迹。 */
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
  private readonly system = inject(SystemState);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly board = viewChild.required<ElementRef<HTMLCanvasElement>>('board');
  private readonly dpr = Math.min(2, devicePixelRatio || 1);
  private strokes: Stroke[] = [];
  private drawing: AbortController | null = null;

  protected readonly pens = PENS;
  protected readonly pen = signal<string>(PENS[0]);
  /** 提示语在第一笔落下后淡出，清空后再回来。 */
  protected readonly hint = signal<'0' | '1' | null>(null);

  constructor() {
    const menus = inject(DesktopMenus);
    const win = inject(DesktopWindow);
    win.setMenus(computed(() => menus.standard('freeform')));
    win.afterResize.pipe(takeUntilDestroyed()).subscribe(() => this.fit());
    /* 首次渲染后量一次尺寸，之后每次主题切换都重新铺画布。 */
    afterRenderEffect(() => {
      this.system.theme();
      untracked(() => this.fit());
    });
    inject(DestroyRef).onDestroy(() => this.drawing?.abort());
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
    for (const stroke of this.strokes) {
      g.strokeStyle = stroke.color;
      g.beginPath();
      stroke.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }

  protected clear(): void {
    this.strokes = [];
    this.fit();
    this.hint.set('1');
  }

  protected start(event: PointerEvent): void {
    this.hint.set('0');
    const rect = this.board().nativeElement.getBoundingClientRect();
    const g = this.context();
    const stroke: Stroke = { color: this.pen(), points: [[event.clientX - rect.left, event.clientY - rect.top]] };
    this.strokes.push(stroke);
    g.strokeStyle = stroke.color;
    g.lineWidth = LINE_WIDTH;

    this.drawing?.abort();
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
    window.addEventListener('pointerup', () => drawing.abort(), { signal: drawing.signal });
  }

  private context(): CanvasRenderingContext2D {
    const g = this.board().nativeElement.getContext('2d');
    if (!g) throw new Error('当前环境不支持 canvas 2d');
    return g;
  }
}

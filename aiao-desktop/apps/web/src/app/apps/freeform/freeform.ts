import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { localWriteFailureMessage } from '../../data/local-write-error';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { Ink, Stroke, StrokeUndo, isStroke, unsettled, visibleStrokes } from './freeform-ink';
import { FreeformStroke } from './freeform.entities';

const PENS = ['#1d1d1f', '#0a84ff', '#ff375f', '#30d158', '#ff9f0a'] as const;

const LINE_WIDTH = 3;

/** 清空画板的确认弹层：Cancel 或 Esc 关闭，Clear 才执行擦除。 */
@Component({
  selector: 'app-freeform-clear-panel',
  imports: [FocusTrap],
  host: { class: 'pop', style: 'width: 300px; padding: 14px' },
  template: `
    <div
      (keydown.escape)="popover.close()"
      appFocusTrap
      aria-label="Clear board"
      aria-modal="true"
      role="dialog"
      style="display: flex; flex-direction: column; gap: 12px"
    >
      <h2 style="font-size: 14px; margin: 0">Clear this board?</h2>
      <p style="font-size: 12px; color: var(--txt-2); margin: 0">
        This removes all {{ strokes() }} strokes from the shared board.
      </p>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <button class="btn" (click)="popover.close()" data-clear-cancel tabindex="0" type="button">Cancel</button>
        <button class="btn" (click)="confirmClear()" data-clear-confirm tabindex="0" type="button">Clear</button>
      </div>
    </div>
  `
})
export class FreeformClearPanel {
  protected readonly popover = inject(PopoverService);
  /** 画布上的笔数，文案里展示。 */
  readonly strokes = input(0);
  /** 确认后执行擦除的回调。 */
  readonly clear = input.required<() => void>();

  protected confirmClear(): void {
    this.popover.close(true);
    this.clear()();
  }
}

/** 正在画的一笔：`points` 随指针移动不断追加。 */
interface PenStroke extends Stroke {
  readonly points: [number, number][];
}

const exec = (command: string): void => {
  document.execCommand(command);
};

/**
 * 无边记：在画布上拖动即可画线，可换笔色、清空；窗口缩放时按新尺寸重绘全部笔迹。
 * 笔迹存在本地库里，所有无边记窗口共用同一块画板，刷新后仍在。⌘Z/⇧⌘Z 撤销重做本窗口画的笔迹。
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
        <button
          class="tbtn"
          [disabled]="busy() || inking()"
          (click)="clear()"
          aria-label="Clear board"
          data-clear
          data-nodrag
          title="Clear"
        >
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
      @if (failure(); as problem) {
        <div
          data-fferror
          role="alert"
          style="position: relative; z-index: 1; padding: 5px 10px; color: var(--red); font-size: 12px; pointer-events: auto"
        >
          <span>{{ problem }}</span>
          <button class="btn" [disabled]="busy()" (click)="retry()" data-retry style="margin-left: 8px" type="button">
            Retry
          </button>
        </div>
      }
    </div>
  `
})
export class FreeformApp {
  private readonly data = inject(DesktopData);
  private readonly system = inject(SystemState);
  private readonly popover = inject(PopoverService);
  /** 本窗口画进库的笔迹，按先后；撤销与重做只在栈里走。 */
  private readonly undoStack = new StrokeUndo();
  private readonly undoCount = signal(0);
  private readonly redoCount = signal(0);
  /** 库里的笔迹，按落笔先后；库还没读到时为 `null`。 */
  private readonly saved = liveQuery<readonly FreeformStroke[] | null>(
    () => FreeformStroke.findAll({ where: ALL_ROWS, orderBy: [{ field: 'createdAt', sort: 'asc' }] }),
    null,
    FreeformStroke
  );
  /** 已松手、库还没回报的笔迹：回报之前照样画在画布上，免得闪一下。 */
  private readonly settling = signal<readonly Ink[]>([]);
  /** 落库失败后留在画布上的笔迹，等用户重试。 */
  private readonly failed = signal<readonly Ink[]>([]);
  /** 清空操作失败后，Retry 应该再次执行删除。 */
  private readonly clearFailed = signal(false);
  private readonly actionError = signal('');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly board = viewChild.required<ElementRef<HTMLCanvasElement>>('board');
  private readonly dpr = Math.min(2, devicePixelRatio || 1);
  private inProgress: PenStroke | null = null;
  private drawing: AbortController | null = null;

  /** 指针按着、正在画。 */
  protected readonly inking = signal(false);
  /** 正在清空或重新保存失败笔迹。 */
  protected readonly busy = signal(false);
  protected readonly pens = PENS;
  protected readonly pen = signal<string>(PENS[0]);
  /** 提示语在有笔迹（或正落笔）时淡出，清空后再回来；库读到之前先藏着。 */
  protected readonly hint = computed<'0' | '1'>(() => {
    const saved = this.saved();
    return (
        saved === null || saved.length > 0 || this.settling().length > 0 || this.failed().length > 0 || this.inking()
      ) ?
        '0'
      : '1';
  });
  protected readonly failure = computed(() => this.actionError());

  constructor() {
    const menus = inject(DesktopMenus);
    const win = inject(DesktopWindow);
    win.setMenus(
      computed(() =>
        menus.standard('freeform', {
          Edit: [
            { id: 'u', label: 'Undo', key: '⌘Z', disabled: !this.undoCount(), run: () => void this.undo() },
            { id: 'r', label: 'Redo', key: '⇧⌘Z', disabled: !this.redoCount(), run: () => void this.redo() },
            '-',
            { id: 'x', label: 'Cut', key: '⌘X', run: () => exec('cut') },
            { id: 'c', label: 'Copy', key: '⌘C', run: () => exec('copy') },
            { id: 'v', label: 'Paste', key: '⌘V', run: () => exec('paste') },
            '-',
            { id: 'a', label: 'Select All', key: '⌘A', run: () => exec('selectAll') }
          ]
        })
      )
    );
    win.afterResize.pipe(takeUntilDestroyed()).subscribe(() => this.fit());
    /* 首次渲染后量一次尺寸；之后主题切换、库里的笔迹变了（含别的窗口画的）都重新铺画布。 */
    afterRenderEffect(() => {
      this.system.theme();
      this.saved();
      this.settling();
      this.failed();
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
    for (const stroke of visibleStrokes(this.saved() ?? [], [...this.settling(), ...this.failed()], this.inProgress)) {
      g.strokeStyle = stroke.color;
      g.beginPath();
      stroke.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }

  /** 清空画板：先弹确认，确认后才删掉当前已落库的全部笔迹。 */
  protected clear(): void {
    if (this.busy() || this.inking()) return;
    const strokes = this.saved() ?? [];
    if (!strokes.length) {
      this.failed.set([]);
      this.undoStack.forgetAll();
      this.syncUndo();
      return;
    }
    const stage = this.stage().nativeElement.getBoundingClientRect();
    this.popover.openComponent(
      FreeformClearPanel,
      {
        x: stage.left + stage.width / 2 - 150,
        y: stage.top + stage.height / 2 - 70,
        origin: 'top left',
        focus: true,
        onClose: reason => {
          if (reason === 'escape' || reason === 'tab') this.board().nativeElement.focus();
        }
      },
      { strokes: strokes.length, clear: () => this.eraseAll() }
    );
  }

  /** 撤销最后一笔：按栈顶 id 从事务里删掉；重做重新落库（拿到新 id 再进撤销栈）。 */
  protected async undo(): Promise<void> {
    if (this.busy() || this.inking()) return;
    const entry = this.undoStack.undoTop();
    if (!entry) return;
    this.syncUndo();
    this.actionError.set('');
    this.busy.set(true);
    try {
      await this.data.transaction(async executor => {
        const repository = executor.getRepository(FreeformStroke);
        const [row] = await repository.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: entry.id }] },
          limit: 1
        });
        if (row) await repository.remove(row);
      });
    } catch (error) {
      this.actionError.set(localWriteFailureMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async redo(): Promise<void> {
    if (this.busy() || this.inking()) return;
    const entry = this.undoStack.redoTop();
    if (!entry) return;
    this.syncUndo();
    this.actionError.set('');
    this.busy.set(true);
    try {
      await this.persist({ color: entry.color, points: entry.points });
    } finally {
      this.busy.set(false);
    }
  }

  protected retry(): void {
    if (this.busy()) return;
    if (this.clearFailed()) {
      this.eraseAll();
      return;
    }
    const failed = this.failed();
    if (!failed.length) return;
    this.actionError.set('');
    this.failed.set([]);
    this.busy.set(true);
    void Promise.all(failed.map(stroke => this.persist(stroke))).finally(() => this.busy.set(false));
  }

  protected start(event: PointerEvent): void {
    if (this.busy()) return;
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

  /** 存进库；落库之前先记在 `settling` 里继续画着，失败后保留在画布上等待重试。 */
  private async persist(stroke: Stroke | Ink): Promise<void> {
    const row = this.data.instantiate(FreeformStroke, { color: stroke.color, points: stroke.points });
    const ink: Ink = { id: row.id, color: stroke.color, points: stroke.points };
    this.settling.update(list => [...list, ink]);
    try {
      await (await this.data.repository(FreeformStroke)).create(row);
      this.actionError.set('');
      this.undoStack.push({ id: row.id, color: stroke.color, points: stroke.points });
      this.syncUndo();
    } catch (error) {
      this.settling.update(list => list.filter(item => item.id !== ink.id));
      this.failed.update(list => (list.some(item => item.id === ink.id) ? list : [...list, ink]));
      this.actionError.set(localWriteFailureMessage(error));
    }
  }

  /** 清空画板：删掉当前已落库的全部笔迹，失败时保留原画板。 */
  private async erase(strokes: readonly FreeformStroke[]): Promise<void> {
    await this.data.transaction(async executor => {
      const repository = executor.getRepository(FreeformStroke);
      for (const stroke of strokes) await repository.remove(stroke);
    });
    this.actionError.set('');
    this.clearFailed.set(false);
  }

  /** 确认后真正清空：成功清掉两个撤销栈。 */
  private eraseAll(): void {
    if (this.busy()) return;
    const strokes = this.saved() ?? [];
    this.actionError.set('');
    this.clearFailed.set(false);
    this.busy.set(true);
    void this.erase(strokes)
      .then(
        () => {
          this.settling.set([]);
          this.failed.set([]);
          this.undoStack.forgetAll();
          this.syncUndo();
        },
        error => {
          this.clearFailed.set(true);
          this.actionError.set(localWriteFailureMessage(error));
        }
      )
      .finally(() => this.busy.set(false));
  }

  /** 撤销/重做菜单的可用状态跟着栈走。 */
  private syncUndo(): void {
    this.undoCount.set(this.undoStack.undoSize());
    this.redoCount.set(this.undoStack.redoSize());
  }

  private dropSettled(saved: readonly FreeformStroke[]): void {
    const settling = unsettled(this.settling(), saved);
    if (settling.length !== this.settling().length) this.settling.set(settling);
    const failed = unsettled(this.failed(), saved);
    if (failed.length !== this.failed().length) this.failed.set(failed);
    if (!failed.length && !this.clearFailed()) this.actionError.set('');
  }

  private context(): CanvasRenderingContext2D {
    const g = this.board().nativeElement.getContext('2d');
    if (!g) throw new Error('当前环境不支持 canvas 2d');
    return g;
  }
}

import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, afterNextRender, computed, inject, viewChild, viewChildren } from '@angular/core';

import { ApplicationRegistry } from '../../services/application-registry';
import { DesktopWindow } from '../../services/desktop-window';
import { Overlays } from '../../services/overlays';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';

/** 方向键在窗口卡片网格里的移动方向。 */
export type MissionMove = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

function isMissionMove(key: string): key is MissionMove {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

/**
 * 方向键在等宽网格里的落点（纯函数）：左右一列、上下整行（`columns` 由调用方按容器与卡片宽度算出），
 * 越界停在边缘；没有聚焦任何卡片时从第 0 张出发。没有窗口时恒为 0。
 */
export function missionMoveIndex(current: number, columns: number, count: number, key: MissionMove): number {
  const last = Math.max(0, count - 1);
  const row = Math.max(1, columns);
  const moves: Readonly<Record<MissionMove, number>> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -row,
    ArrowDown: row
  };
  return Math.max(0, Math.min(last, current + moves[key]));
}

/**
 * Mission Control：全部窗口（含最小化）的缩略图网格，⌃↑ 打开。
 *
 * 无障碍（ADESK-US-108）：整屏是模态 `dialog`（焦点陷阱在 `OverlayLayer` 里加），卡片是带窗口标题的按钮；
 * 打开时焦点落在最前台窗口的卡片上，方向键在网格里移动，Enter / 空格聚焦窗口（最小化的先还原），
 * Esc / ⌃↑ 关闭后焦点回到打开之前的元素。样式内联在本组件里，不进全局样式表。
 */
@Component({
  selector: 'app-mission-control',
  imports: [Icon],
  host: {
    id: 'mission',
    class: 'nosel',
    role: 'dialog',
    'aria-label': 'Mission Control',
    'aria-modal': 'true',
    '[class.out]': "overlays.mission() === 'closing'",
    '(pointerdown)': 'backdrop($event)',
    '(keydown)': 'key($event)'
  },
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      overflow: hidden;
      background: rgba(24, 27, 34, 0.4);
      -webkit-backdrop-filter: blur(44px) saturate(140%) brightness(0.74);
      backdrop-filter: blur(44px) saturate(140%) brightness(0.74);
      animation: missionIn 0.24s var(--e-out) both;
      will-change: opacity;
    }
    :host.out {
      animation: missionOut 0.15s var(--e-io) both;
    }
    @keyframes missionIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes missionOut {
      to {
        opacity: 0;
      }
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
      gap: 20px;
      width: min(100%, 1280px);
      max-height: 100%;
      overflow-y: auto;
      align-content: start;
      padding: 6px;
      box-sizing: border-box;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      border-radius: 12px;
      background: var(--win);
      border: 1px solid var(--line);
      box-shadow: 0 4px 18px #0003;
      cursor: default;
    }
    .card.mini {
      opacity: 0.62;
    }
    .thumb {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 7px;
      background:
        radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.05) 45%),
        linear-gradient(160deg, rgba(110, 132, 196, 0.5), rgba(58, 66, 104, 0.55));
    }
    .thumb svg {
      width: 44px;
      height: 44px;
      opacity: 0.85;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .row svg {
      width: 18px;
      height: 18px;
      flex: none;
    }
    .row span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12.5px;
      color: var(--txt);
    }
    .empty {
      grid-column: 1 / -1;
      text-align: center;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      padding-top: 40px;
    }
  `,
  template: `
    <div class="cards" #grid aria-label="Windows" role="group">
      @for (win of windows(); track win.id) {
        <div
          class="card"
          #card
          [attr.aria-label]="win.title()"
          [class.mini]="win.minimized()"
          (click)="activate(win)"
          (keydown.enter)="activate(win)"
          (keydown.space)="activateByKey($event, win)"
          role="button"
          tabindex="0"
        >
          <div class="thumb" [style.aspect-ratio]="ratio(win)">
            <svg [appIcon]="apps()[win.appId].icon"></svg>
          </div>
          <div class="row">
            <svg [appIcon]="apps()[win.appId].icon"></svg>
            <span>{{ win.title() }}</span>
          </div>
        </div>
      } @empty {
        <div class="empty" role="status">No windows</div>
      }
    </div>
  `
})
export class MissionControl {
  private readonly wm = inject(WindowManager);
  private readonly registry = inject(ApplicationRegistry);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly cards = viewChildren<ElementRef<HTMLElement>>('card');
  private readonly gridEl = viewChild<ElementRef<HTMLElement>>('grid');
  protected readonly overlays = inject(Overlays);
  protected readonly apps = this.registry.apps;
  /** 全部窗口（含最小化），前台窗口的卡片在最前。 */
  protected readonly windows = computed(() =>
    this.wm
      .windows()
      .filter(win => !win.closing())
      .sort((a, b) => b.zIndex() - a.zIndex())
  );

  constructor() {
    /* 打开动画走完再聚焦最前台窗口的卡片；这期间 Mission Control 已经关闭就不再抢焦点。 */
    afterNextRender(() =>
      setTimeout(() => {
        if (this.overlays.mission() !== 'open') return;
        (this.cards()[0]?.nativeElement ?? this.host).focus();
      }, 120)
    );
  }

  /** 缩略图按窗口保存的宽高比铺开，收进 Dock 的窗口看起来仍是那个比例。 */
  protected ratio(win: DesktopWindow): string {
    const { width, height } = win.box();
    return `${width} / ${height}`;
  }

  /** 点卡片（或 Enter / 空格）：关闭总览，最小化的窗口先还原，再统一置前并拿焦点。 */
  protected activate(win: DesktopWindow): void {
    this.overlays.closeMission();
    setTimeout(() => {
      if (win.minimized()) this.wm.unminimize(win.id);
      this.wm.focus(win.id);
    }, 140);
  }

  protected activateByKey(event: Event, win: DesktopWindow): void {
    event.preventDefault();
    this.activate(win);
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.overlays.closeMission();
      return;
    }
    /* ⌃↑ 再次按下时收起；其余按键只处理方向键（Tab 由 FocusTrap 接管）。 */
    if (event.key === 'ArrowUp' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      this.overlays.closeMission();
      return;
    }
    if (!isMissionMove(event.key)) return;
    event.preventDefault();
    this.move(event.key);
  }

  protected backdrop(event: PointerEvent): void {
    if (event.target === this.host || event.target === this.gridEl()?.nativeElement) this.overlays.closeMission();
  }

  private move(key: MissionMove): void {
    const count = this.windows().length;
    if (!count) return;
    const target = missionMoveIndex(this.cardIndex(), this.columns(), count, key);
    this.cards()[target]?.nativeElement.focus();
  }

  /** 当前焦点所在的卡片下标；焦点不在任何卡片上（打开瞬间）时从 0 出发。 */
  private cardIndex(): number {
    const active = this.document.activeElement;
    const index = this.cards().findIndex(el => el.nativeElement === active);
    return index < 0 ? 0 : index;
  }

  /** 网格实际列数：按第一张卡片的宽度算，容器变窄自动减少。 */
  private columns(): number {
    const grid = this.gridEl()?.nativeElement;
    const first = this.cards()[0]?.nativeElement;
    if (!grid || !first) return 1;
    return Math.max(1, Math.floor(grid.clientWidth / (first.getBoundingClientRect().width + 20)));
  }
}

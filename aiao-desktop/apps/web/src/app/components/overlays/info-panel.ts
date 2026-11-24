import { Component, ElementRef, computed, inject, input, linkedSignal } from '@angular/core';

import { extensionOf } from '../../disk/disk-kinds';
import { parentOf } from '../../disk/disk-path';
import { FileOpener } from '../../services/file-opener';
import { FsNode } from '../../services/file-system';
import { PopoverCloseReason, PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { Toast } from '../../services/toast';
import { finderDate } from '../../shared/format';
import { Icon } from '../../shared/icon';

/**
 * 打开「显示简介」面板；没有给坐标时放在窗口中央偏上。
 * 键盘打开的（菜单栏 ⌘I、条目上按菜单键选 Get Info）焦点进入面板，关闭时回到打开前聚焦的元素。
 */
export function showInfoPanel(
  popover: PopoverService,
  node: FsNode,
  point?: Readonly<{ x: number; y: number }>,
  keyboard = false
): void {
  const anchor = keyboard && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  popover.openComponent(
    InfoPanel,
    {
      x: point?.x ?? Math.max(8, Math.round(innerWidth / 2 - 170)),
      y: point?.y ?? Math.round(innerHeight / 2.6),
      origin: 'top left',
      ...(keyboard ?
        {
          focus: true,
          onClose: (reason: PopoverCloseReason) => {
            if (RETURNS_FOCUS.has(reason)) anchor?.focus();
          }
        }
      : {})
    },
    { node }
  );
}

/**
 * 「显示简介」面板（ADESK-US-212）：名称、种类、大小、所在位置与修改时间，
 * 能打开的文件多一个「打开方式」区，Change All 把所选应用存成这类文件的默认（D-28）。
 */
@Component({
  selector: 'app-info-panel',
  imports: [Icon],
  template: `
    <div class="ip" [attr.aria-label]="'Get Info — ' + node().name" data-info-panel role="dialog">
      <div class="head">
        <div class="pic"><svg [appIcon]="node().icon"></svg></div>
        <div class="nm">{{ node().name }}</div>
        <button class="tbtn" (click)="close()" data-ip-close tabindex="0" title="Close">
          <svg appIcon="g-x"></svg>
        </button>
      </div>
      <dl class="meta">
        <div>
          <dt>Kind</dt>
          <dd>{{ node().k }}</dd>
        </div>
        @if (node().kind === 'file' && node().size) {
          <div>
            <dt>Size</dt>
            <dd>{{ node().size }}</dd>
          </div>
        }
        <div>
          <dt>Where</dt>
          <dd>{{ where() }}</dd>
        </div>
        @if (node().date) {
          <div>
            <dt>Modified</dt>
            <dd>{{ finderDate(node().date) }}</dd>
          </div>
        }
      </dl>
      @if (choices().length) {
        <div class="ow" data-ip-open-with>
          <label class="ow-label"
            >Open with:<select #app [value]="selected()" (change)="selected.set(app.value)" data-ip-app>
              @for (choice of choices(); track choice.id) {
                <option [value]="choice.id">{{ choice.name }}</option>
              }
            </select></label
          >
          <button class="btn" (click)="changeAll()" data-ip-change-all tabindex="0">Change All…</button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      display: block;
    }
    .ip {
      width: 330px;
      padding: 14px 16px 16px;
      border-radius: 12px;
      background: var(--win-2);
      color: var(--txt);
      box-shadow: 0 12px 40px #0005;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .pic {
      width: 40px;
      height: 40px;
      flex: none;
      display: grid;
      place-items: center;
    }
    .pic svg {
      width: 36px;
      height: 36px;
    }
    .nm {
      flex: 1;
      min-width: 0;
      font-size: 15px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .meta {
      margin: 0 0 12px;
      display: grid;
      gap: 7px;
    }
    .meta > div {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 10px;
    }
    dt {
      color: var(--txt-2);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .ow {
      border-top: 1px solid #8888;
      padding-top: 12px;
      display: grid;
      gap: 10px;
    }
    .ow-label {
      display: grid;
      gap: 8px;
      color: var(--txt-2);
    }
    select {
      flex: 1;
      min-width: 0;
      padding: 6px;
      color: inherit;
      background: var(--field);
      border: 1px solid #888;
      border-radius: 5px;
    }
    .btn {
      background: var(--win);
      color: var(--txt);
      padding: 6px 12px;
      border: 1px solid #888;
      border-radius: 5px;
    }
  `
})
export class InfoPanel {
  private readonly opener = inject(FileOpener);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly finderDate = finderDate;
  protected readonly choices = computed(() => this.opener.choices(this.node()));
  /**
   * 下拉当前选中的应用：默认是第一个候选。linkedSignal 的简写形式在源信号重算时会无条件用源值覆盖用户选择
   * （任何偏好写入都会连锁重算 choices），这里只在当前值已不在候选中时才回到默认。
   */
  protected readonly selected = linkedSignal({
    source: this.choices,
    computation: (choices, previous) =>
      previous && choices.some(choice => choice.id === previous.value) ? previous.value : (choices[0]?.id ?? '')
  });
  protected readonly where = computed(() => {
    const path = this.node().path;
    if (!path) return 'Not on Macintosh HD';
    const parent = parentOf(path);
    return parent.length ? `/${parent.join('/')}` : 'Macintosh HD';
  });

  readonly node = input.required<FsNode>();

  protected close(): void {
    this.popover.close(true, 'escape');
  }

  /** 用下拉当前显示的应用把这类文件的默认打开方式存进偏好；值取点击时刻的 DOM，不依赖信号的更新时序。 */
  protected changeAll(): void {
    const value = this.host.querySelector<HTMLSelectElement>('[data-ip-app]')?.value;
    const app = this.choices().find(choice => choice.id === value);
    if (!app) return;
    this.opener.setDefaultApp(this.node(), app.id).then(
      () => {
        this.toast.show(`All “.${extensionOf(this.node().name)}” files will now open with ${app.name}.`);
        this.popover.close(true, 'command');
      },
      (error: unknown) => this.toast.show(error instanceof Error ? error.message : String(error))
    );
  }
}

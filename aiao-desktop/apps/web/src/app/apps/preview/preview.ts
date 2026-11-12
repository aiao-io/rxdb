import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FsNode } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WALLPAPERS } from '../../services/wallpaper';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from '../mail/mail-composer';
import { markMatches } from './preview-find';

type PreviewKind = 'sheet' | 'video' | 'image';

/** 界面指南那一页的各节标题与正文。 */
const SHEET = [
  {
    title: '1 · Materials',
    text: 'Chrome is a material, not a colour. Every bar, sidebar and tray samples what sits behind it — blur, then saturate, then tint. Opacity alone always reads as a sticker pasted on the window.'
  },
  {
    title: '2 · Depth',
    text: "Four shadow layers: a hairline for the edge, a contact shadow so it doesn't float, a body, and an ambient spill. Unfocused windows drop the outer two and lighten the rest."
  },
  {
    title: '3 · Motion',
    text: 'Menus in 130ms, panels in 300ms, nothing past 350ms. Ease out harder than you ease in — the arrival is what the eye judges.'
  },
  {
    title: '4 · Pointer',
    text: 'The arrow is the default state and it stays the arrow over buttons. A hand means "this navigates". A hand on everything means nothing.'
  },
  {
    title: '5 · Restraint',
    text: 'If an effect cannot hold sixty frames, remove the effect. A dropped frame is more visible than any gradient you were trying to render.'
  }
] as const;

const fileName = (file: string | FsNode | undefined): string =>
  (typeof file === 'string' ? file : file?.name) || 'Untitled';

/** 按文件名挑内容：指南、视频占位或图片。 */
const kindOf = (name: string): PreviewKind => {
  if (/guidelines|spec/i.test(name)) return 'sheet';
  return /\.(mp4|mov)$/i.test(name) ? 'video' : 'image';
};

/** 预览：按文件类型显示指南页、视频占位或图片，标题栏带分享菜单和会高亮匹配的查找框。 */
@Component({
  selector: 'app-preview',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './preview.html'
})
export class PreviewApp {
  private readonly win = inject(DesktopWindow);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly wm = inject(WindowManager);
  private readonly mail = inject(MailComposer);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly name = fileName(this.win.options.file);
  protected readonly kind = kindOf(this.name);
  protected readonly image = WALLPAPERS[/screenshot/i.test(this.name) ? 'tahoe' : 'ridges'].url;
  protected readonly sheet = SHEET;
  protected readonly finding = signal(false);

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('preview')));
  }

  protected openShare(anchor: HTMLElement): void {
    this.popover.menuUnder(anchor, [
      { id: 'm', label: 'Mail', icon: 'g-compose', run: () => this.mail.compose(this.name) },
      { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => this.wm.open('messages') },
      '-',
      { id: 'c', label: 'Copy', run: () => this.toast.show('Copied to clipboard') },
      { id: 'p', label: 'Print…', run: () => this.toast.show('Sent to printer') }
    ]);
  }

  /** 查找框展开时聚焦，收起时清空输入并去掉高亮。 */
  protected toggleFind(): void {
    const opening = !this.finding();
    this.finding.set(opening);
    const input = this.field().nativeElement;
    if (opening) {
      input.focus();
      return;
    }
    input.value = '';
    markMatches(this.body().nativeElement, '');
  }

  protected find(value: string): void {
    const text = value.trim();
    const count = markMatches(this.body().nativeElement, text.toLowerCase());
    if (text.length > 1) this.toast.show(count ? `${count} ${count === 1 ? 'match' : 'matches'}` : 'Not found');
  }
}

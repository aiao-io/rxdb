import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { appFilesOver } from '../../services/app-files';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FilePanels, FilePanelTicket } from '../../services/file-panels';
import { FileSystem } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { SaveLocation, TextDocument } from './text-document';
import { autolink } from './textedit-text';

const RICH_FONT = '14px/1.65 -apple-system,Inter,sans-serif';
type DocumentChoice = 'save' | 'discard' | 'cancel';

@Component({
  selector: 'app-textedit',
  imports: [FocusTrap, Icon, TrafficLights],
  host: { style: 'display: contents', '(click)': 'openLink($event)' },
  styles: `
    .document-status {
      padding: 6px 12px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--win-2);
    }
    .document-error {
      padding: 8px 12px;
      color: var(--txt);
      background: var(--win);
    }
    .document-dialog {
      position: absolute;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      background: #0006;
    }
    .document-card {
      width: min(360px, 90%);
      padding: 20px;
      border-radius: 12px;
      background: var(--win);
      color: var(--txt);
      box-shadow: 0 12px 40px #0005;
    }
    .document-buttons {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
  `,
  template: `
    <div class="tb plain" data-drag>
      <div class="title" data-te-title>{{ title() }}</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz">
        <button
          class="tbtn"
          #format
          (click)="openFormat(format)"
          aria-label="Format"
          data-nodrag
          data-tefmt
          tabindex="0"
          title="Format"
        >
          <svg appIcon="g-title"></svg>
        </button>
      </div>
    </div>
    <div class="document-status" aria-live="polite" role="status">
      <span>{{ statusLabel() }}</span>
      <button [disabled]="busy()" (click)="save()" tabindex="0">Save</button>
      <button [disabled]="busy()" (click)="save(true)" tabindex="0">Save As…</button>
    </div>
    @if (document.error(); as error) {
      <div class="document-error" role="alert">
        {{ error }}
        @if (document.path()) {
          <button [disabled]="busy()" (click)="reload()" tabindex="0">Reload from Disk</button>
        }
      </div>
    }
    <div class="te">
      <div
        class="te-doc selectable"
        #doc
        [attr.contenteditable]="!blocked()"
        [style.font]="rich() ? richFont : null"
        (input)="edit()"
        (keydown)="key($event)"
        aria-label="Document text"
        aria-multiline="true"
        data-te-doc
        role="textbox"
        spellcheck="false"
        tabindex="0"
      ></div>
    </div>
    @if (prompt(); as action) {
      <!-- 脚本聚焦的模态容器，内部按钮参与 Tab 顺序。 -->
      <div
        class="document-dialog"
        (keydown.escape)="choose('cancel'); $event.stopPropagation()"
        appFocusTrap
        tabindex="-1"
      >
        <div class="document-card" [attr.aria-labelledby]="dialogId" aria-modal="true" role="alertdialog">
          <h3 [id]="dialogId">
            {{ action === 'close' ? 'Save changes before closing?' : 'Discard changes and reload?' }}
          </h3>
          <p>“{{ document.name() }}” has unsaved changes.</p>
          <div class="document-buttons">
            <button (click)="choose('cancel')" data-autofocus tabindex="0">Cancel</button>
            <button (click)="choose('discard')" tabindex="0">{{ action === 'close' ? 'Don’t Save' : 'Reload' }}</button>
            @if (action === 'close') {
              <button (click)="choose('save')" tabindex="0">Save Changes</button>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class TextEditApp {
  private readonly win = inject(DesktopWindow);
  private readonly injector = inject(Injector);
  private readonly fs = inject(FileSystem);
  private readonly wm = inject(WindowManager);
  private readonly panels = inject(FilePanels);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly doc = viewChild.required<ElementRef<HTMLElement>>('doc');
  private panel: FilePanelTicket | null = null;
  private resolveChoice: ((choice: DocumentChoice) => void) | null = null;
  protected readonly document = new TextDocument(
    appFilesOver(this.fs),
    name => this.chooseSave(name),
    this.win.options.node?.path ?? null
  );
  protected readonly dialogId = `document-confirm-${this.win.id}`;
  protected readonly prompt = signal<'close' | 'reload' | null>(null);
  protected readonly richFont = RICH_FONT;
  protected readonly rich = signal(false);
  protected readonly title = computed(() => `${this.document.name()}${this.document.dirty() ? ' — Edited' : ''}`);
  protected readonly busy = computed(() => ['loading', 'saving'].includes(this.document.status()));
  protected readonly blocked = computed(
    () => this.document.status() === 'loading' || this.win.closePending() || this.prompt() !== null
  );
  protected readonly statusLabel = computed(() => {
    if (this.document.status() === 'saving') return 'Saving…';
    if (this.document.status() === 'loading') return 'Loading…';
    if (this.document.error()) return 'Not saved';
    if (this.document.dirty() || !this.document.stamp()) return 'Unsaved';
    return 'Saved';
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard('textedit', {
          File: [
            { id: 'n', label: 'New Window', key: '⌘N', run: () => this.wm.open('textedit', { force: true }) },
            { id: 'w', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() },
            '-',
            { id: 's', label: 'Save', key: '⌘S', disabled: this.busy(), run: () => void this.save() },
            { id: 'sa', label: 'Save As…', key: '⇧⌘S', disabled: this.busy(), run: () => void this.save(true) },
            {
              id: 'reload',
              label: 'Reload from Disk',
              disabled: this.busy() || !this.document.path(),
              run: () => void this.reload()
            }
          ]
        })
      )
    );
    this.win.confirmClose = () => this.confirmClose();
    effect(() => {
      this.win.hasUnsavedChanges.set(this.document.dirty() || this.document.status() === 'saving');
      this.win.title.set(this.title());
      const path = this.document.path();
      if (path) this.win.restoreOptions.set({ file: this.document.name(), nodePath: path });
    });
    afterNextRender(() => {
      const path = this.win.options.node?.path;
      if (path) void this.document.load(path);
      this.installEffects();
    });
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!this.document.dirty() && this.document.status() !== 'saving') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeunload', beforeUnload);
      this.win.confirmClose = null;
      this.win.hasUnsavedChanges.set(false);
      this.document.dispose();
      this.panel?.close();
      this.choose('cancel');
    });
  }

  protected edit(): void {
    this.document.edit(this.doc().nativeElement.innerText);
    this.win.hasUnsavedChanges.set(this.document.dirty());
  }

  protected key(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    if (!this.blocked()) void this.save(event.shiftKey);
  }

  protected async save(asCopy = false): Promise<boolean> {
    const saved = await this.document.save(asCopy);
    const error = this.document.error();
    if (!saved && error) this.toast.show(error);
    return saved;
  }

  protected async reload(): Promise<void> {
    const path = this.document.path();
    if (!path || this.busy()) return;
    if (this.document.dirty() && (await this.ask('reload')) !== 'discard') return;
    await this.document.load(path);
  }

  protected choose(choice: DocumentChoice): void {
    this.prompt.set(null);
    this.resolveChoice?.(choice);
    this.resolveChoice = null;
  }

  /** 正文里的网址是注入的 HTML，只能在窗口上做事件委托；原版由文档级的 `data-openext` 处理器统一交给真实浏览器，这里只管本窗口。 */
  protected openLink(event: MouseEvent): void {
    const link = (event.target as Element).closest<HTMLElement>('[data-openext]');
    if (!link) return;
    event.preventDefault();
    window.open(link.dataset['openext'], '_blank', 'noopener');
  }

  protected openFormat(anchor: HTMLElement): void {
    const rich = this.rich();
    this.popover.menuUnder(anchor, [
      { id: 'p', label: 'Plain Text', checked: !rich, run: () => this.rich.set(false) },
      { id: 'r', label: 'Rich Text', checked: rich, run: () => this.rich.set(true) },
      '-',
      { id: 'b', label: 'Bold', key: '⌘B', run: () => this.apply('bold') },
      { id: 'i', label: 'Italic', key: '⌘I', run: () => this.apply('italic') },
      '-',
      { id: 'w', label: 'Word Count', run: () => this.toast.show(`${this.wordCount()} words`) }
    ]);
  }

  private installEffects(): void {
    effect(
      () => {
        const text = this.document.text();
        const element = this.doc().nativeElement;
        if (element.innerText !== text) element.innerHTML = autolink(text);
      },
      { injector: this.injector }
    );
    effect(
      () => {
        const path = this.document.path();
        const node = path ? this.fs.nodeAt(path) : null;
        const stamp = untracked(() => this.document.stamp());
        const changed = node && stamp && (node.date?.getTime() !== stamp.modified || node.bytes !== stamp.size);
        if (path && changed)
          untracked(() => {
            if (!this.document.dirty() && !this.busy() && !this.prompt()) void this.document.load(path);
          });
      },
      { injector: this.injector }
    );
  }

  private ask(action: 'close' | 'reload'): Promise<DocumentChoice> {
    this.prompt.set(action);
    return new Promise(resolve => (this.resolveChoice = resolve));
  }

  private async confirmClose(): Promise<boolean> {
    if (this.prompt()) return false;
    if (this.document.status() === 'saving') await this.document.save();
    if (!this.document.dirty()) return true;
    const choice = await this.ask('close');
    if (choice === 'cancel') return false;
    if (choice === 'discard') return true;
    return (await this.document.save()) && !this.document.dirty();
  }

  private async chooseSave(name: string): Promise<SaveLocation | null> {
    const ticket = this.panels.show({
      mode: 'save',
      app: this.win.app,
      accept: [],
      maxBytes: Number.MAX_SAFE_INTEGER,
      suggestedName: name,
      nameLength: 255,
      restoreFocus: () => this.doc().nativeElement.focus()
    });
    this.panel = ticket;
    const result = await ticket.result;
    this.panel = null;
    if (!result) return null;
    if (result.kind !== 'save') throw new Error('The save panel returned an unexpected result.');
    return { path: [...result.dir, result.name], replace: result.replace };
  }

  private apply(command: string): void {
    this.doc().nativeElement.focus();
    document.execCommand(command);
  }

  private wordCount(): number {
    return (this.doc().nativeElement.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
  }
}

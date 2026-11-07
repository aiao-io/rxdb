import type { PaletteEntry, PaletteGroup } from '@aiao/rxdb-admin';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  viewChild
} from '@angular/core';
import { LucideDynamicIcon, LucideSearch } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText, type AdminIcon } from '../context';
import { AdminModalDirective, closeOnBackdrop } from '../use-dialog';

/**
 * 命令面板：聚合菜单、命令与应用注册的来源（如全文搜索），键盘上下选择、回车执行。
 * 以原生模态 `<dialog>` 呈现；输入框是 combobox，结果是 listbox。
 */
@Component({
  selector: 'rxdb-admin-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminModalDirective, LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './command-palette.component.html'
})
export class AdminCommandPaletteComponent {
  readonly #injector = inject(Injector);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly state = injectAdminStore(this.shell.palette);
  protected readonly Search = LucideSearch;

  constructor() {
    // 先让指令完成 showModal()，再聚焦输入框：afterNextRender 在本轮视图更新与全部 effect 之后执行
    effect(() => {
      if (this.state().open) afterNextRender(() => this.field()?.nativeElement.focus(), { injector: this.#injector });
    });
  }

  protected close(): void {
    this.shell.palette.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    closeOnBackdrop(event, () => this.close());
  }

  protected onQuery(event: Event): void {
    this.shell.palette.setQuery((event.target as HTMLInputElement).value);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.shell.palette.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void this.shell.palette.select();
    }
  }

  protected groupLabel(group: PaletteGroup): string | undefined {
    return group.labelKey ? this.t(group.labelKey) : group.label;
  }

  protected hover(entry: PaletteEntry): void {
    if (entry.index !== this.state().selectedIndex) this.shell.palette.hover(entry.index);
  }

  protected choose(entry: PaletteEntry): void {
    void this.shell.palette.select(entry.index);
  }

  protected iconOf(entry: PaletteEntry): AdminIcon | undefined {
    return entry.item.icon as AdminIcon | undefined;
  }
}

import { applyPopoverPosition, findOptionLabel } from '@aiao/rxdb-model';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';

let _uid = 0;

/**
 * 基于 Popover API 的下拉选择组件
 *
 * @description
 * 使用浏览器原生 Popover API 渲染选项列表，在 top layer 渲染，
 * 确保在 `overflow: auto/hidden` 容器内也不会被裁剪。
 * 支持关键字过滤、键盘导航（↑↓ 移动、Enter 选中、Escape 关闭）。
 * 打开弹框自动高亮第一项，搜索后也自动高亮第一条结果。
 */
@Component({
  selector: 'rxdb-popover-select',
  standalone: true,
  imports: [FormsModule],
  template: `
    <button
      class="select select-sm text-left"
      #trigger
      [attr.popovertarget]="uid"
      [style.min-width]="minWidth()"
      type="button"
    >
      {{ currentLabel() }}
    </button>
    <div
      class="bg-base-100 rounded-box border-base-300 border shadow-xl"
      #popoverEl
      [id]="uid"
      [style.min-width]="minWidth()"
      (beforetoggle)="onBeforeToggle($event)"
      (keydown)="onKeydown($event)"
      (toggle)="onToggle($event)"
      popover
      tabindex="-1"
    >
      <div class="mb-1 p-2">
        <input
          class="input input-sm w-full"
          #filterInput
          [attr.aria-activedescendant]="activeItemId()"
          [attr.aria-controls]="listId"
          [attr.aria-expanded]="true"
          [ngModel]="filterText()"
          (ngModelChange)="filterText.set($event)"
          aria-autocomplete="list"
          placeholder="搜索..."
          role="combobox"
          type="text"
        />
      </div>
      <ul class="menu menu-sm max-h-60 w-full flex-nowrap overflow-y-auto px-2" [id]="listId" role="listbox">
        @for (option of filteredOptions(); track option.value; let i = $index) {
          <li role="none">
            <button
              class="flex w-full items-center text-left text-sm"
              [attr.aria-selected]="option.value === selected()"
              [class.bg-primary/15]="option.value === selected()"
              [class.font-semibold]="option.value === selected()"
              [class.menu-focus]="activeIndex() === i"
              [id]="uid + '-opt-' + option.value"
              (click)="onSelect(option.value)"
              role="option"
              type="button"
            >
              <span class="grow">{{ option.label }}</span>
              @if (option.value === selected()) {
                <svg
                  class="text-primary h-3 w-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
            </button>
          </li>
        } @empty {
          <li class="px-3 py-1.5 text-sm opacity-50">无匹配项</li>
        }
      </ul>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PopoverSelectComponent {
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly popoverEl = viewChild.required<ElementRef<HTMLElement>>('popoverEl');
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  protected readonly uid = `rxdb-ps-${++_uid}`;
  protected readonly listId = `${this.uid}-list`;
  protected readonly filterText = signal('');
  protected readonly activeIndex = signal(0);

  readonly options = input.required<ReadonlyArray<{ value: string; label: string }>>();
  readonly selected = input<string>('');
  readonly placeholder = input<string>('请选择');
  readonly minWidth = input<string>('8rem');

  readonly selectChange = output<string>();

  readonly currentLabel = computed(() => findOptionLabel(this.options(), this.selected(), this.placeholder()));

  readonly filteredOptions = computed(() => {
    const filter = this.filterText().toLowerCase().trim();
    if (!filter) return this.options();
    return this.options().filter(opt => opt.label.toLowerCase().includes(filter));
  });

  readonly activeItemId = computed(() => {
    const idx = this.activeIndex();
    const opts = this.filteredOptions();
    return idx >= 0 && idx < opts.length ? `${this.uid}-opt-${opts[idx].value}` : null;
  });

  constructor() {
    effect(() => {
      this.filteredOptions();
      untracked(() => this.activeIndex.set(0));
    });
  }

  onBeforeToggle(event: Event): void {
    const te = event as ToggleEvent;
    if (te.newState === 'open') {
      applyPopoverPosition(this.popoverEl().nativeElement, this.trigger().nativeElement.getBoundingClientRect());
      this.filterText.set('');
    }
  }

  onToggle(event: Event): void {
    if ((event as ToggleEvent).newState === 'open') {
      this.filterInput()?.nativeElement.focus();
      this.activeIndex.set(0);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    const opts = this.filteredOptions();
    const len = opts.length;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (len > 0) {
          this.activeIndex.update(i => (i + 1) % len);
          this.scrollActiveIntoView();
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (len > 0) {
          this.activeIndex.update(i => (i - 1 + len) % len);
          this.scrollActiveIntoView();
        }
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const opt = opts[this.activeIndex()];
        if (opt) this.onSelect(opt.value);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        this.popoverEl().nativeElement.hidePopover();
        this.trigger().nativeElement.focus();
        break;
      }
      case 'Tab': {
        this.popoverEl().nativeElement.hidePopover();
        break;
      }
    }
  }

  onSelect(value: string): void {
    this.selectChange.emit(value);
    this.popoverEl().nativeElement.hidePopover();
    this.trigger().nativeElement.focus();
  }

  private scrollActiveIntoView(): void {
    const opts = this.filteredOptions();
    const opt = opts[this.activeIndex()];
    if (!opt) return;
    document.getElementById(`${this.uid}-opt-${opt.value}`)?.scrollIntoView({ block: 'nearest' });
  }
}

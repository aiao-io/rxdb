import { getPath, type DrawerRow, type ResolvedControl } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { injectAdminShell, injectAdminText } from '../context';
import { AdminShortcutListComponent } from './shortcut-list.component';
import { AdminThemeGridComponent } from './theme-grid.component';
import { AdminWidgetListComponent } from './widget-list.component';

type NumberSpec = Extract<ResolvedControl, { kind: 'number' }>;

/** 需要独占一行（控件在标题下方）的控件种类。 */
export const STACKED_KINDS: ReadonlySet<ResolvedControl['kind']> = new Set([
  'cards',
  'themes',
  'widgets',
  'shortcuts',
  'color'
]);

/**
 * 数字控件：输入过程只改草稿，失焦或回车才提交（并夹取）；清空可空数字写 `null`，非法输入还原。
 */
@Component({
  selector: 'rxdb-admin-number-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <span class="flex items-center gap-1">
      <input
        class="input input-sm w-28"
        [attr.data-testid]="'pref-' + row().path"
        [attr.id]="'prefs-' + row().id"
        [attr.max]="control().max"
        [attr.min]="control().min"
        [attr.step]="control().step"
        [disabled]="!row().enabled"
        [value]="draft()"
        (blur)="commit()"
        (input)="onInput($event)"
        (keydown)="onKeyDown($event)"
        type="number"
      />
      @if (control().unit; as unit) {
        <span class="text-xs opacity-60" [textContent]="unit"></span>
      }
    </span>
  `
})
export class AdminNumberControlComponent {
  readonly #shell = injectAdminShell();

  /** 当前值；只有它变化时才重置草稿（行对象因文案 / 其他偏好变化而重建时，进行中的输入不丢）。 */
  protected readonly value = computed(() => this.row().value as number | null);
  protected readonly draft = linkedSignal(() => this.#format(this.value()));

  /** 设置行。 */
  readonly row = input.required<DrawerRow>();

  /** 数字控件的约束（范围、步长、单位、可空）。 */
  readonly control = input.required<NumberSpec>();

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.commit();
  }

  protected commit(): void {
    if (this.draft().trim() === '') {
      if (this.control().nullable) this.row().set(null);
      else this.draft.set(String(this.value()));
      return;
    }
    const parsed = Number(this.draft());
    if (!Number.isFinite(parsed)) {
      this.draft.set(this.#format(this.value()));
      return;
    }
    this.row().set(parsed);
    // 值被清洗（越界夹取）后可能与当前值相同，行的值不变就不会触发草稿同步：回读存储里的最终值
    this.draft.set(this.#format(getPath(this.#shell.preferences.value, this.row().path) as number | null));
  }

  #format(value: number | null): string {
    return value === null ? '' : String(value);
  }
}

/**
 * 文本控件：输入过程只改草稿，失焦（值有变化时）或回车提交。
 */
@Component({
  selector: 'rxdb-admin-text-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <input
      class="input input-sm w-56"
      [attr.data-testid]="'pref-' + row().path"
      [attr.id]="'prefs-' + row().id"
      [attr.placeholder]="placeholder()"
      [disabled]="!row().enabled"
      [value]="draft()"
      (blur)="onBlur()"
      (input)="onInput($event)"
      (keydown)="onKeyDown($event)"
      type="text"
    />
  `
})
export class AdminTextControlComponent {
  protected readonly value = computed(() => String(this.row().value ?? ''));
  protected readonly draft = linkedSignal(() => this.value());

  /** 设置行。 */
  readonly row = input.required<DrawerRow>();

  /** 占位文本。 */
  readonly placeholder = input<string>();

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected onBlur(): void {
    if (this.draft() !== this.value()) this.row().set(this.draft());
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.row().set(this.draft());
  }
}

/**
 * 按控件种类渲染一行设置的输入部分。
 */
@Component({
  selector: 'rxdb-admin-row-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminNumberControlComponent,
    AdminShortcutListComponent,
    AdminTextControlComponent,
    AdminThemeGridComponent,
    AdminWidgetListComponent
  ],
  host: { style: 'display: contents' },
  templateUrl: './controls.component.html'
})
export class AdminRowControlComponent {
  protected readonly t = injectAdminText();
  /** 当前值的文本形式（下拉、颜色等控件用）。 */
  protected readonly text = computed(() => String(this.row().value ?? ''));

  /** 设置行。 */
  readonly row = input.required<DrawerRow>();

  protected onSwitch(event: Event): void {
    this.row().set((event.target as HTMLInputElement).checked);
  }

  protected onValue(event: Event): void {
    this.row().set((event.target as HTMLInputElement | HTMLSelectElement).value);
  }
}

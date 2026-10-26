import {
  BOM_EDITOR_INPUTS,
  BOM_VIEW_STYLES,
  bomEditorFields,
  bomErrorText,
  parseBomEditorFields,
  type BomEditorFields,
  type BomViewCommands,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

const inputs = BOM_EDITOR_INPUTS;

// 每个实例独立的说明元素 id，供 aria-describedby 关联
let editorSequence = 0;

/**
 * 经共享领域命令保存合法发生项的原生表单（对齐 React `BomLineEditor`、Vue `BomLineEditor`）。
 *
 * @remarks
 * 生效期按 UTC 填写与显示（`datetime-local` 不带时区），说明经 `aria-describedby` 关联到日期字段；
 * 保存失败与共享字段校验失败原样展示，切换发生项时重置表单。
 */
@Component({
  selector: 'ao-bom-line-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }', BOM_VIEW_STYLES],
  template: `
    <section
      class="bom-view bom-line-editor"
      [attr.aria-busy]="editor().saving || editor().phase === 'loading'"
      aria-label="BOM 行编辑器"
    >
      @if (editor().value === null) {
        <p role="status">{{ editor().phase === 'loading' ? '正在加载发生项…' : '请选择一条 BOM 行进行编辑' }}</p>
      }
      @if (editor().value !== null) {
        <form (submit)="save($event)">
          <h3>BOM 行编辑</h3>
          <p [id]="utcHintId">生效期按 UTC 填写与显示</p>
          @for (input of inputs; track input.field) {
            <label
              >{{ input.label }}
              <input
                [attr.aria-describedby]="input.type === 'datetime-local' ? utcHintId : null"
                [attr.step]="input.type === 'datetime-local' ? '0.001' : null"
                [disabled]="disabled()"
                [name]="input.field"
                [type]="input.type"
                [value]="fields()[input.field]"
                (input)="update(input.field, $event)"
              />
            </label>
          }
          @if (editor().value?.readOnlyReason !== null) {
            <p role="note">{{ editor().value?.readOnlyReason }}</p>
          }
          @if (editor().saving) {
            <p role="status">正在保存发生项…</p>
          }
          <button [disabled]="disabled()" type="submit">{{ editor().saving ? '保存中…' : '保存' }}</button>
        </form>
      }
      @if (error() !== null) {
        <p role="alert">{{ errorText(error()) }}</p>
      }
    </section>
  `
})
export class BomLineEditor {
  private currentOccurrenceId: string | null = null;
  private editorGeneration = 0;
  protected readonly utcHintId = `ao-bom-line-editor-utc-${++editorSequence}`;
  /** 共享控制器发布的视图状态（`useBomView` 的 `state()`）。 */
  readonly state = input.required<BomViewState>();
  /** 共享控制器命令，原样透传。 */
  readonly commands = input.required<BomViewCommands>();
  readonly inputs = inputs;
  readonly editor = computed(() => this.state().editor);
  readonly value = computed(() => this.editor().value);
  readonly fields = signal(bomEditorFields(null));
  readonly formError = signal<unknown>(null);
  readonly disabled = computed(() => this.editor().saving || !this.editor().value?.editable);
  readonly error = computed(() => this.formError() ?? this.editor().error);
  readonly errorText = bomErrorText;

  constructor() {
    effect(() => {
      this.syncEditorIdentity();
      this.fields.set(bomEditorFields(this.value()));
      this.formError.set(null);
    });
  }

  update(field: keyof BomEditorFields, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.fields.update(current => ({ ...current, [field]: value }));
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.disabled()) return;
    this.syncEditorIdentity();
    const saveOccurrenceId = this.currentOccurrenceId;
    const saveGeneration = this.editorGeneration;
    this.formError.set(null);
    try {
      await this.commands().saveOccurrence(parseBomEditorFields(this.fields()));
    } catch (error) {
      if (this.currentOccurrenceId === saveOccurrenceId && this.editorGeneration === saveGeneration) {
        this.formError.set(error);
      }
    }
  }

  private syncEditorIdentity(): void {
    const occurrenceId = this.value()?.occurrenceId ?? null;
    if (occurrenceId === this.currentOccurrenceId) return;
    this.currentOccurrenceId = occurrenceId;
    this.editorGeneration += 1;
  }
}

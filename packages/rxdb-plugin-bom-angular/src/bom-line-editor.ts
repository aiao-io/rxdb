import {
  BOM_VIEW_STYLES,
  bomEditorFields,
  bomErrorText,
  parseBomEditorFields,
  type BomEditorFields,
  type BomViewCommands,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

const inputs: readonly { field: keyof BomEditorFields; label: string; type: string }[] = [
  { field: 'qty', label: '用量', type: 'text' },
  { field: 'componentScrap', label: '组件损耗', type: 'text' },
  { field: 'operationSeq', label: '投料工序', type: 'number' },
  { field: 'effectiveFrom', label: '生效起点', type: 'datetime-local' },
  { field: 'effectiveTo', label: '生效终点', type: 'datetime-local' }
];

/** 经共享领域命令保存合法发生项的原生表单。 */
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
          @for (input of inputs; track input.field) {
            <label
              >{{ input.label }}
              <input
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
  readonly state = input.required<BomViewState>();
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
    this.formError.set(null);
    try {
      await this.commands().saveOccurrence(parseBomEditorFields(this.fields()));
    } catch (error) {
      this.formError.set(error);
    }
  }
}

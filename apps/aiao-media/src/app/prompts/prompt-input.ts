import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewEncapsulation,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { loadPromptEditor } from './prompt-assets';
import { schedulePromptFocus } from './prompt-focus';
import { serializePrompt, type PromptNode, type PromptState } from './prompt-state';

@Component({
  selector: 'app-prompt-input',
  template: ` <div class="prompt-input">
    <div class="prompt-editor-host" #host></div>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      <pre tabindex="0">{{ serialized().text }}</pre>
      @for (field of state().fields; track field.id) {
        <p>{{ field.label }}：{{ state().values[field.id] || '未填写' }}</p>
      }
      <button (click)="initialize()" type="button">重试输入编辑器</button>
    }
    <div class="prompt-input-tools">
      <button [disabled]="!ready() || disabled()" (click)="undo()" type="button">撤销</button>
      <button [disabled]="!ready() || disabled()" (click)="redo()" type="button">重做</button>
      <button (click)="preview.set(!preview())" type="button">预览最终提示词</button>
      <button [disabled]="!ready() || !serialized().valid" (click)="copyFinal()" type="button">复制最终提示词</button>
      <span data-testid="prompt-count">{{ serialized().text.length }} / 2000</span>
    </div>
    @if (serialized().issues.length && serialized().text.length) {
      <p class="prompt-input-issue" role="status">
        {{ serialized().issues.join('；') }}
      </p>
    }
    @if (preview()) {
      <pre class="prompt-final" aria-label="最终提示词预览" tabindex="0">{{ serialized().text }}</pre>
    }
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
  </div>`,
  styleUrl: './prompt-input.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PromptInput implements AfterViewInit, OnDestroy {
  private readonly platform = inject(PLATFORM_ID);
  private editor?: Editor;
  private lastState?: PromptState;
  private destroyed = false;
  private initializing = false;
  private historyBoundary?: () => void;
  readonly state = input.required<PromptState>();
  readonly disabled = input(false);
  readonly changed = output<PromptState>();
  readonly readiness = output<boolean>();
  readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  readonly error = signal('');
  readonly ready = signal(false);
  readonly preview = signal(false);
  readonly message = signal('');
  constructor() {
    effect(() => {
      const state = this.state(),
        disabled = this.disabled();
      if (!this.editor) return;
      this.editor.setEditable(!disabled, false);
      // ProseMirror editability does not update native inputs inside node views.
      for (const input of this.host().nativeElement.querySelectorAll<HTMLInputElement>('.prompt-field input'))
        input.disabled = disabled;
      if (state !== this.lastState) {
        this.lastState = state;
        this.editor.commands.setContent(this.editorDocument(state), {
          emitUpdate: false
        });
        this.historyBoundary?.();
      }
    });
  }
  serialized() {
    return serializePrompt(this.state());
  }
  ngAfterViewInit() {
    if (isPlatformBrowser(this.platform)) void this.initialize();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.editor?.destroy();
  }
  async initialize() {
    if (this.destroyed || this.initializing || !isPlatformBrowser(this.platform)) return;
    this.initializing = true;
    this.ready.set(false);
    this.readiness.emit(false);
    this.editor?.destroy();
    this.editor = undefined;
    try {
      const { Editor, Node, Document, Paragraph, Text, HardBreak, UndoRedo, closeHistory, EditorState } =
        await loadPromptEditor();
      if (this.destroyed) return;
      const fieldNode = Node.create({
        name: 'templateField',
        group: 'inline',
        inline: true,
        atom: true,
        selectable: false,
        addAttributes: () => ({
          fieldId: { default: '' },
          value: { default: '' }
        }),
        // Never trust HTML/paste as an application-declared parameter node.
        parseHTML: () => [],
        renderHTML: () => ['span', { class: 'prompt-field' }],
        addNodeView: () => {
          return ({ node, editor }) => {
            const dom = document.createElement('span');
            dom.className = 'prompt-field';
            dom.contentEditable = 'false';
            const label = document.createElement('span');
            const field = this.state().fields.find(value => value.id === node.attrs['fieldId']);
            label.textContent = `${field?.label ?? '未知字段'}${field?.required ? '*' : ''}：`;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = node.attrs['value'];
            input.setAttribute('aria-label', `模板参数：${field?.label ?? '未知字段'}`);
            input.placeholder = field?.required ? '必填' : '可选';
            input.disabled = !editor.isEditable;
            const fieldId = node.attrs['fieldId'];
            const commit = () => {
              if (this.disabled()) return;
              const transaction = editor.state.tr;
              editor.state.doc.descendants((current, pos) => {
                if (current.type.name === 'templateField' && current.attrs['fieldId'] === fieldId)
                  transaction.setNodeMarkup(pos, undefined, {
                    ...current.attrs,
                    value: input.value
                  });
              });
              editor.view.dispatch(closeHistory(transaction));
              editor.view.dispatch(closeHistory(editor.state.tr));
            };
            let composing = false;
            input.addEventListener('compositionstart', () => {
              composing = true;
            });
            input.addEventListener('compositionend', () => {
              composing = false;
              commit();
            });
            input.addEventListener('input', () => {
              if (!composing) commit();
            });
            input.addEventListener('keydown', event => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !composing) {
                event.preventDefault();
                if (event.shiftKey) editor.commands.redo();
                else editor.commands.undo();
              }
            });
            dom.append(label, input);
            return {
              dom,
              stopEvent: () => true,
              ignoreMutation: () => true,
              update: updated => {
                if (updated.type.name !== 'templateField' || updated.attrs['fieldId'] !== fieldId) return false;
                if (!composing && input.value !== updated.attrs['value']) input.value = updated.attrs['value'];
                input.disabled = this.disabled();
                return true;
              }
            };
          };
        }
      });
      this.lastState = this.state();
      this.editor = new Editor({
        element: this.host().nativeElement,
        extensions: [Document, Paragraph, Text, HardBreak, UndoRedo, fieldNode],
        content: this.editorDocument(this.state()),
        editable: !this.disabled(),
        editorProps: {
          attributes: {
            role: 'textbox',
            'aria-label': '创意描述',
            'aria-multiline': 'true',
            class: 'prompt-editor',
            id: 'image-prompt'
          },
          handlePaste: (view, event) => {
            if (this.disabled()) return true;
            event.preventDefault();
            const text = event.clipboardData?.getData('text/plain') ?? '';
            if (text.length > 30000) {
              this.message.set('粘贴超过安全上限，原输入已保留');
              return true;
            }
            view.dispatch(view.state.tr.insertText(text));
            return true;
          },
          handleDrop: () => true
        },
        onUpdate: ({ editor }) => {
          const document = editor.getJSON() as PromptNode;
          const values = { ...this.state().values };
          for (const paragraph of document.content ?? [])
            for (const node of paragraph.content ?? [])
              if (node.type === 'templateField' && node.attrs) values[node.attrs.fieldId] = node.attrs.value ?? '';
          const next = { document, fields: this.state().fields, values };
          this.lastState = next;
          this.changed.emit(next);
        }
      });
      this.historyBoundary = () => {
        if (this.editor) {
          const { doc, plugins } = this.editor.state;
          // External replacement starts a new editing session. closeHistory()
          // only separates undo groups and would still allow undoing into the
          // previous template with the new template's field definitions.
          this.editor.view.updateState(EditorState.create({ doc, plugins }));
        }
      };
      this.error.set('');
      this.ready.set(true);
      this.readiness.emit(true);
    } catch {
      this.error.set('编辑器初始化失败，当前正文与参数已保留；重试成功前不能生成。');
      this.ready.set(false);
      this.readiness.emit(false);
    } finally {
      this.initializing = false;
    }
  }
  focus() {
    const editor = this.editor;
    if (!editor) return;
    schedulePromptFocus(
      this.host().nativeElement,
      () => !this.destroyed && this.editor === editor && !this.disabled(),
      // Tiptap's focus command schedules another unguarded animation frame.
      // Focus the current ProseMirror view only after the final guard above.
      () => editor.view.focus()
    );
  }
  undo() {
    if (!this.disabled()) this.editor?.commands.undo();
  }
  redo() {
    if (!this.disabled()) this.editor?.commands.redo();
  }
  async copyFinal() {
    const result = this.serialized();
    if (!this.ready() || !result.valid) return;
    try {
      await navigator.clipboard.writeText(result.text);
      this.message.set('最终提示词已复制');
    } catch {
      this.preview.set(true);
      this.message.set('复制失败，请在预览中手动选择正文');
    }
  }
  private editorDocument(state: PromptState): JSONContent {
    const doc = structuredClone(state.document);
    for (const paragraph of doc.content ?? [])
      for (const node of paragraph.content ?? [])
        if (node.type === 'templateField' && node.attrs) node.attrs.value = state.values[node.attrs.fieldId] ?? '';
    return doc;
  }
}

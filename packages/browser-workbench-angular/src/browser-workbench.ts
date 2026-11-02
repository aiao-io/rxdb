import { mountWorkbench, type BrowserWorkbenchOptions } from '@aiao/browser-workbench';
import { CodeEditor } from '@aiao/code-editor-angular';
import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  Component,
  ElementRef,
  EnvironmentInjector,
  PLATFORM_ID,
  createComponent,
  inject,
  input,
  type AfterViewInit,
  type OnDestroy
} from '@angular/core';

/** 使用现有 CodeEditor 挂载共享工作台。 */
@Component({
  selector: 'ao-browser-workbench',
  template: '',
  host: { style: 'display:block;height:100%;min-height:0' }
})
export class BrowserWorkbench implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly environment = inject(EnvironmentInjector);
  private readonly application = inject(ApplicationRef);
  private readonly platform = inject(PLATFORM_ID);
  private workbench?: ReturnType<typeof mountWorkbench>;
  /** 初始化选项；更新选项需要重新挂载工作台。 */
  readonly options = input<BrowserWorkbenchOptions>({});

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platform)) return;
    this.workbench = mountWorkbench(this.host.nativeElement, this.options(), (element, initial) => {
      const editor = createComponent(CodeEditor, { hostElement: element, environmentInjector: this.environment });
      editor.setInput('value', initial.value);
      editor.setInput('language', initial.language);
      editor.setInput('label', '项目源码');
      editor.setInput('theme', 'dark');
      const change = editor.instance.aoChange.subscribe(initial.onChange);
      const cursor = () => {
        const view = editor.instance.view!;
        const position = view.state.selection.main.head;
        const line = view.state.doc.lineAt(position);
        initial.onCursor(line.number, position - line.from + 1);
      };
      for (const event of ['keyup', 'mouseup', 'input']) element.addEventListener(event, cursor);
      this.application.attachView(editor.hostView);
      editor.changeDetectorRef.detectChanges();
      return {
        update: (value, language) => {
          editor.setInput('value', value);
          editor.setInput('language', language);
          editor.changeDetectorRef.detectChanges();
        },
        layout: () => editor.instance.view?.requestMeasure(),
        focus: () => editor.instance.focus(),
        dispose: () => {
          for (const event of ['keyup', 'mouseup', 'input']) element.removeEventListener(event, cursor);
          change.unsubscribe();
          this.application.detachView(editor.hostView);
          editor.destroy();
        }
      };
    });
  }

  ngOnDestroy(): void {
    this.workbench?.dispose();
  }
}

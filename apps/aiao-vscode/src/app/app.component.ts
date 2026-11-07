import { computeMinimalDocumentChange } from '@aiao/code-editor';
import { CodeEditor } from '@aiao/code-editor-angular';
import { RxDB } from '@aiao/rxdb';
import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  Component,
  ElementRef,
  EnvironmentInjector,
  PLATFORM_ID,
  createComponent,
  inject,
  signal,
  type AfterViewInit,
  type OnDestroy
} from '@angular/core';
import { selectLine } from '@codemirror/commands';
import { setDiagnostics } from '@codemirror/lint';
import { gotoLine, openSearchPanel, search } from '@codemirror/search';
import { EditorSelection, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { filter, firstValueFrom, of, take, timeout } from 'rxjs';
import { mountSwitchableEditor } from '../workbench/editor-switcher.js';
import type { WorkbenchEditorMount } from '../workbench/editor.js';
import { createGitBackend } from '../workbench/git-backend.js';
import { createRouterBackend } from '../workbench/git/git-router-backend.js';
import { completeOAuthCallback } from '../workbench/git/github/github-oauth-bridge.js';
import type { GitHubService } from '../workbench/git/github/github-service.js';
import { createGitHubService } from '../workbench/git/github/github-service.js';
import { loadMonacoEditor } from '../workbench/monaco-loader.js';
import { mountWorkbench, type WorkbenchHandle } from '../workbench/mount.js';
import { createRxDBWorkbenchCatalog } from '../workbench/rxdb-catalog.js';

const CATALOG_TIMEOUT_MS = 10000;

/** 在当前行上方插入空行并把光标移入新行，对齐 VS Code 的 Ctrl+Shift+Enter。 */
function insertBlankLineAbove(view: EditorView): boolean {
  const { state, dispatch } = view;
  const position = state.doc.lineAt(state.selection.main.from).from;
  dispatch(
    state.update({
      changes: { from: position, insert: state.lineBreak },
      selection: EditorSelection.cursor(position),
      scrollIntoView: true,
      userEvent: 'input'
    })
  );
  return true;
}

/** 应用根组件：把浏览器开发工作台挂到整页，并用 RxDB 保存项目目录元数据。 */
@Component({
  selector: 'app-root',
  template: `
    @if (error()) {
      <div class="app-notice app-error">{{ error() }}</div>
    } @else if (!ready()) {
      <div class="app-notice">正在连接本地数据库…</div>
    }
  `,
  styles: `
    .app-notice {
      display: grid;
      place-items: center;
      height: 100%;
      color: #cccccc;
      font-family: system-ui, sans-serif;
    }
    .app-error {
      color: #f48771;
      padding: 0 2rem;
      text-align: center;
    }
  `,
  host: { style: 'display:block;height:100%;min-height:0' }
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly environment = inject(EnvironmentInjector);
  private readonly application = inject(ApplicationRef);
  private readonly platform = inject(PLATFORM_ID);
  private readonly rxdb = inject(RxDB);
  private workbench?: WorkbenchHandle;
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platform)) return;
    void this.mountWhenReady();
  }

  ngOnDestroy(): void {
    this.workbench?.dispose();
  }

  private readonly mountCodeMirror: WorkbenchEditorMount = (element, initial) => {
    const editor = createComponent(CodeEditor, { hostElement: element, environmentInjector: this.environment });
    editor.setInput('value', initial.value);
    editor.setInput('language', initial.language);
    editor.setInput('label', '项目源码');
    editor.setInput('theme', 'dark');
    editor.setInput('indentWithTab', true);
    editor.setInput('indentUnit', initial.indentUnit ?? '  ');
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
    // basicSetup 只带 searchKeymap，面板靠按 Mod+F 时自装且默认停在底部；这里显式预装并把查找组件对齐到编辑器顶部。
    editor.instance.setExtensions([search({ top: true })]);
    return {
      update: (value, language) => {
        editor.setInput('value', value);
        editor.setInput('language', language);
        editor.changeDetectorRef.detectChanges();
      },
      replace: value => {
        const view = editor.instance.view;
        if (!view) return;
        const change = computeMinimalDocumentChange(view.state.doc.toString(), value);
        // 空 userEvent 会被 history 并入上一次输入组，一次撤销连格式化前的编辑一起回退；独立标签保证单步撤销。
        if (change) view.dispatch({ changes: change, annotations: Transaction.userEvent.of('format') });
      },
      layout: () => editor.instance.view?.requestMeasure(),
      focus: () => editor.instance.focus(),
      setIndentUnit: unit => {
        editor.setInput('indentUnit', unit);
        editor.changeDetectorRef.detectChanges();
      },
      setDiagnostics: diagnostics => {
        const view = editor.instance.view;
        if (!view) return;
        view.dispatch(
          setDiagnostics(
            view.state,
            diagnostics.map(diagnostic => {
              const line = view.state.doc.line(Math.min(Math.max(1, diagnostic.line), view.state.doc.lines));
              const from = Math.min(line.to, line.from + Math.max(0, (diagnostic.column ?? 1) - 1));
              return {
                from,
                to: from === line.to ? from : Math.min(line.to, from + 1),
                severity: 'error',
                message: diagnostic.message
              } satisfies Parameters<typeof setDiagnostics>[1][number];
            })
          )
        );
      },
      runCommand: (command, argument) => {
        const view = editor.instance.view;
        if (!view) return false;
        if (command === 'gotoLine') return gotoLine(view);
        if (command === 'gotoLineAt') {
          const line = view.state.doc.line(Math.min(Math.max(1, argument ?? 1), view.state.doc.lines));
          view.dispatch({ selection: EditorSelection.cursor(line.from), scrollIntoView: true });
          view.focus();
          return true;
        }
        if (command === 'selectLine') return selectLine(view);
        if (command === 'find') return openSearchPanel(view);
        return insertBlankLineAbove(view);
      },
      getViewState: () => {
        const view = editor.instance.view!;
        return {
          anchor: view.state.selection.main.anchor,
          head: view.state.selection.main.head,
          scrollTop: view.scrollDOM.scrollTop,
          scrollLeft: view.scrollDOM.scrollLeft
        };
      },
      restoreViewState: state => {
        const view = editor.instance.view!;
        const clamp = (offset: number) => Math.min(Math.max(0, offset), view.state.doc.length);
        view.dispatch({ selection: EditorSelection.single(clamp(state.anchor), clamp(state.head)) });
        view.scrollDOM.scrollTop = state.scrollTop;
        view.scrollDOM.scrollLeft = state.scrollLeft;
      },
      dispose: () => {
        for (const event of ['keyup', 'mouseup', 'input']) element.removeEventListener(event, cursor);
        change.unsubscribe();
        this.application.detachView(editor.hostView);
        editor.destroy();
      }
    };
  };

  /** 数据库连不上时退回内存目录：项目仍可编辑 / 预览 / 导出，只是重开不恢复目录列表。 */
  private async mountWhenReady(): Promise<void> {
    let connected = false;
    try {
      connected = await firstValueFrom(
        this.rxdb
          .adapterConnected$('sqlite-wasm')
          .pipe(filter(Boolean), take(1), timeout({ first: CATALOG_TIMEOUT_MS, with: () => of(false) }))
      );
      if (!connected) console.warn('RxDB adapter did not connect; project catalog will not persist');
    } catch (error) {
      console.warn('RxDB adapter failed to connect; project catalog will not persist', error);
    }
    const github = createGitHubService();
    if (location.pathname === '/github-callback') {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');
      void (async () => {
        try {
          if (!code || !state) throw new Error('OAuth 回调缺少 code 或 state');
          await completeOAuthCallback(github.auth, code, state);
          history.replaceState({}, '', '/');
          window.close();
        } catch (error) {
          this.error.set(error instanceof Error ? error.message : String(error));
          history.replaceState({}, '', '/');
        }
      })();
    }
    this.workbench = mountWorkbench(
      this.host.nativeElement,
      {
        ...(connected ? { catalog: createRxDBWorkbenchCatalog(this.rxdb) } : {}),
        backend: createRouterBackend({
          local: createGitBackend('/browser-workbench-assets/'),
          github: github.createBackend()
        }),
        githubApi: github.api,
        githubAuth: github.auth
      },
      (element, initial) =>
        mountSwitchableEditor(element, initial, async engine => {
          if (engine === 'codemirror') return this.mountCodeMirror;
          return loadMonacoEditor();
        })
    );
    this.ready.set(true);
    if (new URLSearchParams(location.search).has('workbench-verify')) {
      const target = window as unknown as { workbench?: WorkbenchHandle; ready?: boolean; github?: GitHubService };
      target.workbench = this.workbench;
      target.ready = true;
      target.github = github;
    }
  }
}

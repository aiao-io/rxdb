import { CodeEditor } from '@aiao/code-editor-angular';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { GeneratedFile } from '../../interfaces/designer.interface';

/**
 * 代码预览组件
 *
 * 显示生成的代码文件，支持多文件切换和下载。
 */
@Component({
  selector: 'lib-code-preview',
  imports: [CodeEditor],
  templateUrl: './code-preview.component.html',
  styleUrl: './code-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodePreviewComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly files = input<GeneratedFile[]>([]);
  readonly isOpen = model(false);
  readonly errors = input<string[]>([]);
  readonly packageName = model('');
  readonly packageBusy = input(false);
  readonly packageVersion = input<string | null>(null);
  readonly canArchivePackage = input(false);
  readonly canPublishPackage = input(false);
  readonly download = output<void>();
  readonly archivePackage = output<void>();
  readonly publishPackage = output<void>();

  readonly activeTab = signal(0);

  readonly activeFile = computed(() => {
    const files = this.files();
    const idx = this.activeTab();
    return idx < files.length ? files[idx] : (files[0] ?? null);
  });

  readonly fileLanguage = computed(() => {
    const file = this.activeFile();
    if (!file) return 'typescript';
    const ext = file.path.split('.').pop();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      js: 'javascript',
      json: 'json',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sql: 'sql'
    };
    return langMap[ext ?? ''] ?? 'typescript';
  });

  constructor() {
    effect(() => {
      const lastTab = this.files().length - 1;
      const currentTab = this.activeTab();
      if (currentTab > lastTab) this.activeTab.set(Math.max(0, lastTab));
    });
  }

  fileName(path: string): string {
    return path.split('/').pop() ?? path;
  }

  onPackageNameInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.packageName.set(target.value);
  }
}

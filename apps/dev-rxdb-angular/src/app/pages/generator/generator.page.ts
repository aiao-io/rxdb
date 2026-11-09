import { CodeEditor } from '@aiao/code-editor-angular';
import { SourceFile } from '@aiao/rxdb-client-generator';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ThemeService } from '@modules/angular';
import { AngularSplitModule } from 'angular-split';
import { zipSync, type Zippable } from 'fflate';
import { GENERATOR_DEMOS, generateSourceState } from './generator-state';

function downloadFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

@Component({
  selector: 'app-generator-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './generator.page.html',
  host: { class: 'page-host bg-base-100' },
  imports: [CodeEditor, ReactiveFormsModule, FormsModule, AngularSplitModule]
})
export default class GeneratorPage {
  #themeService = inject(ThemeService);
  /** 窄屏断点探测：<768px 时 as-split 改竖排（并排两个编辑器在手机上各只剩 ~150px，不可用）。 */
  readonly #narrowMedia = window.matchMedia('(max-width: 768px)');

  protected readonly theme = this.#themeService.$currentThemeLightDark;
  protected readonly $selected_demo_index = signal(0);
  protected readonly demos = GENERATOR_DEMOS;
  protected readonly auto_set_json = effect(() => {
    const index = this.$selected_demo_index();
    const value = JSON.stringify(this.demos[index], null, 2);
    this.json.setValue(value);
  });
  protected readonly json = new FormControl<string>(JSON.stringify(this.demos[0], null, 2));
  protected readonly $json_value = toSignal(this.json.valueChanges, { initialValue: this.json.value || '' });
  protected readonly $isNarrow = signal(false);

  /** 当前输入的生成结果：失败或清空时没有产物，不保留上一份成功的代码冒充当前输入 */
  protected readonly $generation = computed(() => generateSourceState(this.$json_value() ?? ''));
  protected readonly $generation_error = computed(() => this.$generation().error);
  protected readonly $can_download = computed(
    () => this.$generation_error() === null && this.$generation().sources.length > 0
  );

  readonly $sources = computed(() => this.$generation().sources);
  $selected_source_index = signal<number>(0);

  $current_demo = computed(() => {
    const index = this.$selected_demo_index();
    return this.demos[index];
  });

  constructor() {
    this.$isNarrow.set(this.#narrowMedia.matches);
    const onNarrowChange = (event: MediaQueryListEvent) => this.$isNarrow.set(event.matches);
    this.#narrowMedia.addEventListener('change', onNarrowChange);
    inject(DestroyRef).onDestroy(() => this.#narrowMedia.removeEventListener('change', onNarrowChange));
  }

  select_demo_tab(index: number) {
    this.$selected_demo_index.set(index);
  }
  download() {
    if (!this.$can_download()) return;
    this.#zip(this.$sources());
  }

  #zip(sourceFiles: SourceFile[]) {
    const files: Zippable = {};
    const encoder = new TextEncoder();
    sourceFiles.forEach(sourceFile => {
      files[sourceFile.getFilePath()] = encoder.encode(sourceFile.getText());
    });
    const zipData = zipSync(files, {
      level: 9,
      mem: 8
    });

    const demo = this.$current_demo();
    const blob = new Blob([zipData], { type: 'application/zip' });
    downloadFile(`${demo.name.toLowerCase()}.zip`, blob);
  }
}

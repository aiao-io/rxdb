import { CodeEditor } from '@aiao/code-editor-angular';
import { EntityMetadataOptions, PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator, SourceFile } from '@aiao/rxdb-client-generator';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ThemeService } from '@modules/angular';
import { AngularSplitModule } from 'angular-split';
import { zipSync, type Zippable } from 'fflate';

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

  protected readonly theme = this.#themeService.$currentThemeLightDark;
  protected readonly $selected_demo_index = signal(0);
  protected readonly demos: EntityMetadataOptions[] = [
    {
      name: 'Todo',
      displayName: 'Todo',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [
        { name: 'title', type: PropertyType.string },
        { name: 'completed', type: PropertyType.boolean, default: false }
      ]
    },
    {
      name: 'Menu',
      displayName: 'Menu',
      repository: 'TreeRepository',
      extends: ['TreeAdjacencyListEntityBase', 'EntityBase'],
      properties: [
        {
          name: 'title',
          type: PropertyType.string
        }
      ]
    }
  ];
  protected readonly auto_set_json = effect(() => {
    const index = this.$selected_demo_index();
    const value = JSON.stringify(this.demos[index], null, 2);
    this.json.setValue(value);
  });
  protected readonly json = new FormControl<string>(JSON.stringify(this.demos[0], null, 2));
  protected readonly $json_value = toSignal(this.json.valueChanges, { initialValue: this.json.value || '' });

  $sources = signal<SourceFile[]>([]);
  $selected_source_index = signal<number>(0);

  $current_demo = computed(() => {
    const index = this.$selected_demo_index();
    return this.demos[index];
  });

  constructor() {
    // 监听 JSON 变化并更新生成结果
    effect(() => {
      const value = this.$json_value();
      if (value) {
        this.#update_json(value);
      }
    });
  }

  select_demo_tab(index: number) {
    this.$selected_demo_index.set(index);
  }
  download() {
    this.#zip(this.$sources());
  }

  #update_json(value: string) {
    if (!value) return;
    try {
      const json = JSON.parse(value);
      const generator = new RxDBClientGenerator();
      generator.addEntity(json);
      generator.exec();
      const files = generator.project.getSourceFiles();
      this.$sources.set(files);
    } catch {
      // console.error(error);
    }
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

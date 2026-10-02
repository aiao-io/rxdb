import { APP_BASE_HREF, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { canOpenExisting, FailureArchiveImportFailure, toImportFailure } from '../../rxdb/failure-archive';
import { FailureArchiveInfo, importFailureArchive, readFailureArchiveInfo } from '../../rxdb/failure-archive-import';
import { openImportedDb } from '../../rxdb/imported-db';

type ImportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'parsed' | 'importing'; readonly file: File; readonly info: FailureArchiveInfo }
  | { readonly phase: 'error'; readonly failure: FailureArchiveImportFailure; readonly dbName: string | null };

/**
 * e2e 失败现场归档的导入页（US-909 阶段 B，AC#7）。
 *
 * @remarks
 * 选择失败用例附件里的 `rxdb-failure-archive` → 读 manifest 显示原库名 →「导入并打开」恢复成同名本地库，写覆盖键后
 * 整页重载打开它。状态见 specs/004-us-909-failure-data-archive/data-model.md §6：`data-phase` 为
 * `idle` / `parsed` / `importing` / `error`。目标里已有同名库时（`target_not_empty` / `target_busy`）提供「打开该库」。
 *
 * 不经 `connectLocalAdapter`：导入不用应用自己的库。
 */
@Component({
  selector: 'app-failure-archive-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './failure-archive.page.html'
})
export default class FailureArchivePage {
  readonly #baseHref = inject(APP_BASE_HREF);
  // 换文件后，上一份还没读完的 manifest 结果作废
  #generation = 0;

  readonly $state = signal<ImportState>({ phase: 'idle' });
  readonly $info = computed(() => {
    const state = this.$state();
    return 'info' in state ? state.info : null;
  });
  readonly $failure = computed(() => {
    const state = this.$state();
    return state.phase === 'error' ? state : null;
  });
  readonly $importing = computed(() => this.$state().phase === 'importing');
  /** 错误是「目标里已有同名库」时可直接打开的库名 */
  readonly $openableDbName = computed(() => {
    const failure = this.$failure();
    return failure && canOpenExisting(failure.failure.code) ? failure.dbName : null;
  });

  async choose(files: FileList | null): Promise<void> {
    const generation = ++this.#generation;
    const file = files?.item(0);
    if (!file) {
      this.$state.set({ phase: 'idle' });
      return;
    }
    try {
      const info = await readFailureArchiveInfo(file);
      if (generation === this.#generation) this.$state.set({ phase: 'parsed', file, info });
    } catch (error) {
      if (generation === this.#generation)
        this.$state.set({ phase: 'error', failure: toImportFailure(error), dbName: null });
    }
  }

  async import(): Promise<void> {
    const state = this.$state();
    if (state.phase !== 'parsed') return;
    this.$state.set({ ...state, phase: 'importing' });
    try {
      await importFailureArchive(state.file, state.info.dbName, this.#baseHref);
    } catch (error) {
      this.$state.set({ phase: 'error', failure: toImportFailure(error), dbName: state.info.dbName });
      return;
    }
    openImportedDb(state.info.dbName);
  }

  open(dbName: string): void {
    openImportedDb(dbName);
  }
}

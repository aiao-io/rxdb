import { getEntityStatus, RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  LOCALE_ID,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemeService } from '@modules/angular';
import { AgGridAngular } from 'ag-grid-angular';
import {
  CheckboxEditorModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColDef,
  CustomFilterModule,
  DateFilterModule,
  GetRowIdParams,
  GridOptions,
  GroupFilterModule,
  HighlightChangesModule,
  ModuleRegistry,
  MultiFilterModule,
  NumberFilterModule,
  SetFilterModule,
  TextEditorModule,
  TextFilterModule,
  themeQuartz,
  ValidationModule
} from 'ag-grid-enterprise';
import { buildColDefs } from './buildColDefs';
import { applyIncrementalGridUpdate } from './grid-data.util';

ModuleRegistry.registerModules([
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  SetFilterModule,
  MultiFilterModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  GroupFilterModule,
  CustomFilterModule,
  ValidationModule,
  HighlightChangesModule,
  TextEditorModule,
  CheckboxEditorModule
]);

const ag_grid_dark = themeQuartz.withParams({
  backgroundColor: 'var(--color-base-200)',
  foregroundColor: 'initial',
  browserColorScheme: 'dark'
});

@Component({
  selector: 'app-ag-grid-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgGridAngular],
  providers: [DatePipe],
  templateUrl: './ag-grid.page.html',
  host: { class: 'page-host bg-base-100' }
})
export default class AgGridPage {
  readonly #destroyRef = inject(DestroyRef);
  // 缓存 fingerprint 用于对比变更
  readonly #fingerprintMap = new Map<Todo['id'], string>();
  readonly #datePipe = inject(DatePipe);
  readonly #locale = inject(LOCALE_ID);
  readonly #themeService = inject(ThemeService);

  // 需要注入 RxDB 才会初始化数据库
  protected rxdb = inject(RxDB);
  protected gridApi = viewChild(AgGridAngular);
  protected gridOptions: GridOptions = {
    onCellValueChanged: event => {
      const updatedData = event.data as Todo;
      // 保存修改（RxDB 会自动检测变化并更新数据库）
      this.rxdb.entityManager.save(updatedData).catch(err => {
        console.error('Failed to save todo:', err);
      });
    }
  };

  columnDefs: ColDef[] = buildColDefs(Todo, {
    locale: this.#locale,
    datePipe: this.#datePipe
  }).map(col => {
    const field = col.field as string;
    return {
      ...col,
      editable: field !== 'id' && field !== 'createdAt' && field !== 'updatedAt'
    };
  });

  defaultColDef: ColDef = {
    flex: 1,
    filter: true,
    sortable: true,
    enableCellChangeFlash: true
  };

  $data = signal([] as Todo[]);

  theme = computed(() => {
    return this.#themeService.$currentThemeIsDark() ? ag_grid_dark : themeQuartz;
  });

  constructor() {
    // 响应式订阅：持续监听数据库变化
    Todo.findAll({
      where: { combinator: 'and', rules: [] },
      orderBy: [
        { field: 'completed', sort: 'asc' },
        { field: 'id', sort: 'desc' }
      ]
    })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(result => {
        const gridApi = this.gridApi()?.api;
        // 首次加载或 gridApi 未就绪，直接设置数据
        if (!gridApi || this.#fingerprintMap.size === 0) {
          result.forEach(r => {
            this.#fingerprintMap.set(r.id, getEntityStatus(r).fingerprint);
          });
          this.$data.set(result);
          return;
        }
        // 增量更新：使用工具函数处理差异对比和事务应用
        applyIncrementalGridUpdate(gridApi, result, this.#fingerprintMap, todo => getEntityStatus(todo).fingerprint);
      });
  }
  // ag-grid 需要 getRowId 来识别行，实现增量更新
  getRowId = (params: GetRowIdParams) => String(params.data.id);
}

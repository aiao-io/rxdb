import { getEntityMetadata, RxDB } from '@aiao/rxdb';
import { createSchemaFromEntity, SchemaInfo } from '@aiao/rxdb-model';
import { QueryBuilderComponent, RxDBQueryOutput } from '@aiao/rxdb-model-angular';
import { Todo } from '@aiao/rxdb-test/entities';
import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap } from 'rxjs';

/**
 * rxdb-model 可视化查询构建器演示页：
 * 1. 从 Todo 元数据派生 schema（createSchemaFromEntity）
 * 2. QueryBuilderComponent 输出查询变更
 * 3. 直接以该查询驱动 Todo.findAll —— 证明构建器产物与 Repository 查询格式无缝对接
 */
@Component({
  selector: 'app-query-builder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QueryBuilderComponent, JsonPipe],
  template: `
    <div class="flex h-full flex-col gap-4 p-4">
      <h1 class="text-lg font-bold">Query Builder — Todo</h1>
      <div class="grow overflow-auto">
        <rxdb-query-builder [schema]="schema" (queryChange)="onQueryChange($event)" />
      </div>
      <div class="flex flex-wrap items-center gap-4 text-sm">
        <span class="badge badge-neutral">匹配 {{ $results().length }} 条</span>
        <span class="text-base-content/60">示例数据总数：{{ $total() }}</span>
      </div>
      <pre class="bg-base-200 max-h-40 overflow-auto rounded p-3 text-xs">{{ $query() | json }}</pre>
    </div>
  `,
  host: { class: 'page-host block h-full bg-base-100' }
})
export default class QueryBuilderPage {
  readonly #destroyRef = inject(DestroyRef);
  /** 查询变更流（switchMap 驱动 Todo.findAll） */
  readonly #query$ = new Subject<RxDBQueryOutput<Todo>>();
  // 注入 RxDB 以初始化本地数据库
  protected rxdb = inject(RxDB);

  /** Todo 元数据派生的查询构建器 schema */
  protected readonly schema: SchemaInfo = {
    entityName: 'Todo',
    fields: createSchemaFromEntity(getEntityMetadata(Todo))
  };

  protected readonly $query = signal<RxDBQueryOutput<Todo> | null>(null);
  protected readonly $results = signal<Todo[]>([]);
  protected readonly $total = signal(0);

  protected readonly $resultTitles = computed(() => this.$results().map(r => r.title));

  constructor() {
    Todo.findAll({ where: { combinator: 'and', rules: [] } })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(list => this.$total.set(list.length));

    this.#query$
      .pipe(
        takeUntilDestroyed(this.#destroyRef),
        switchMap(query => Todo.findAll({ where: query as never, orderBy: [{ field: 'id', sort: 'asc' as const }] }))
      )
      .subscribe(list => this.$results.set(list));
  }

  protected onQueryChange(query: RxDBQueryOutput<Todo>): void {
    this.$query.set(query);
    this.#query$.next(query);
  }
}

/** Angular 对共享实体状态控制器的响应式绑定。
 *
 * 这些入口只建立 signal 与 DestroyRef 订阅，不创建模板、DOM 或 VTable 实例。
 * 自定义展示层可以直接读取 `snapshot()` 并调用返回的 controller 动作。
 */
import {
  cloneStructured,
  createEntityDetailController,
  createEntityDialogController,
  createEntityFormController,
  createEntityListController,
  createQueryBuilderController,
  createQueryTableController,
  structuralEqual,
  type EntityDetailController,
  type EntityDetailControllerOptions,
  type EntityDetailSnapshot,
  type EntityDialogController,
  type EntityDialogControllerOptions,
  type EntityDialogSnapshot,
  type EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot,
  type EntityInstance,
  type EntityListController,
  type EntityListControllerOptions,
  type EntityListSnapshot,
  type QueryBuilderController,
  type QueryBuilderControllerOptions,
  type QueryBuilderSnapshot,
  type QueryTableController,
  type QueryTableControllerOptions,
  type QueryTableSnapshot
} from '@aiao/rxdb-model/headless';
import { DestroyRef, effect, inject, signal, type Signal } from '@angular/core';

/** Angular 输入可以是普通快照、signal 或返回快照的 getter。 */
export type AngularHeadlessOptions<T> = T | Signal<T> | (() => T);

function readOptions<T>(source: AngularHeadlessOptions<T>): T {
  return typeof source === 'function' ? (source as () => T)() : source;
}

function bindController<
  TOptions,
  TController extends {
    snapshot: TSnapshot;
    subscribe(listener: (snapshot: TSnapshot) => void): () => void;
    dispose(): void;
  },
  TSnapshot
>(
  source: AngularHeadlessOptions<TOptions>,
  create: (options: TOptions) => TController,
  sync: (controller: TController, options: TOptions) => void
): { controller: TController; snapshot: Signal<TSnapshot> } {
  const controller = create(readOptions(source));
  const snapshot = signal<TSnapshot>(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  const destroyRef = inject(DestroyRef);
  effect(() => sync(controller, readOptions(source)));
  destroyRef.onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}

/** InjectEntityFormReturn 的控制器与响应式快照。 */
export interface InjectEntityFormReturn {
  readonly controller: EntityFormController;
  readonly snapshot: Signal<EntityFormSnapshot>;
}

/** 注入响应式实体表单控制器，宿主销毁时自动释放订阅。 */
export function injectEntityForm(options: AngularHeadlessOptions<EntityFormControllerOptions>): InjectEntityFormReturn {
  const initial = readOptions(options);
  let previousData = cloneStructured(initial.data);
  let previousEntity = cloneStructured(initial.entity);
  const result = bindController<EntityFormControllerOptions, EntityFormController, EntityFormSnapshot>(
    options,
    createEntityFormController,
    (controller, current) => {
      controller.setFields(current.fields);
      controller.setMode(current.mode ?? 'edit');
      controller.setRelatedEntityProvider(current.relatedEntityProvider);
      if (current.data !== undefined && !structuralEqual(current.data, previousData)) controller.setData(current.data);
      else if (
        current.data === undefined &&
        current.entity !== undefined &&
        !structuralEqual(current.entity, previousEntity)
      )
        controller.setEntity(current.entity);
      previousData = cloneStructured(current.data);
      previousEntity = cloneStructured(current.entity);
    }
  );
  return result;
}
/** injectEntityFormHeadless 的等价命名别名。 */
export const injectEntityFormHeadless = injectEntityForm;

/** InjectQueryBuilderReturn 的控制器与响应式快照。 */
export interface InjectQueryBuilderReturn<T = Record<string, unknown>> {
  readonly controller: QueryBuilderController<T>;
  readonly snapshot: Signal<QueryBuilderSnapshot<T>>;
}

/** 注入响应式查询构建器控制器。 */
export function injectQueryBuilder<T = Record<string, unknown>>(
  options: AngularHeadlessOptions<QueryBuilderControllerOptions<T>> = {}
): InjectQueryBuilderReturn<T> {
  return bindController(options, createQueryBuilderController, (controller, current) => {
    if (current.fields) controller.setFields(current.fields);
  });
}
/** injectQueryBuilderHeadless 的等价命名别名。 */
export const injectQueryBuilderHeadless = injectQueryBuilder;

/** InjectEntityListReturn 的控制器与响应式快照。 */
export interface InjectEntityListReturn<T extends EntityInstance = EntityInstance> {
  readonly controller: EntityListController<T>;
  readonly snapshot: Signal<EntityListSnapshot<T>>;
}

/** 注入响应式实体列表控制器。 */
export function injectEntityList<T extends EntityInstance = EntityInstance>(
  options: AngularHeadlessOptions<EntityListControllerOptions<T>> = {}
): InjectEntityListReturn<T> {
  return bindController(options, createEntityListController, (controller, current) => {
    if (current.query !== undefined) controller.setQuery(current.query);
    if (current.records !== undefined) controller.setRecords(current.records);
    if (current.page !== undefined || current.pageSize !== undefined)
      controller.setPage(current.page ?? 0, current.pageSize);
    controller.setCapabilities(current.capabilities);
  });
}
/** injectEntityListHeadless 的等价命名别名。 */
export const injectEntityListHeadless = injectEntityList;

/** InjectEntityDetailReturn 的控制器与响应式快照。 */
export interface InjectEntityDetailReturn {
  readonly controller: EntityDetailController;
  readonly snapshot: Signal<EntityDetailSnapshot>;
}

/** 注入响应式实体详情控制器，字段、模式和宿主数据随输入更新。 */
export function injectEntityDetail(
  options: AngularHeadlessOptions<EntityDetailControllerOptions>
): InjectEntityDetailReturn {
  const initial = readOptions(options);
  let previousData = cloneStructured(initial.data);
  let previousEntity = cloneStructured(initial.entity);
  return bindController(options, createEntityDetailController, (controller, current) => {
    controller.form.setFields(current.fields);
    controller.form.setMode(current.mode ?? 'edit');
    controller.form.setRelatedEntityProvider(current.relatedEntityProvider);
    if (current.data !== undefined && !structuralEqual(current.data, previousData))
      controller.form.setData(current.data);
    else if (
      current.data === undefined &&
      current.entity !== undefined &&
      !structuralEqual(current.entity, previousEntity)
    )
      controller.form.setEntity(current.entity);
    previousData = cloneStructured(current.data);
    previousEntity = cloneStructured(current.entity);
  });
}
/** injectEntityDetailHeadless 的等价命名别名。 */
export const injectEntityDetailHeadless = injectEntityDetail;

/** InjectEntityDialogReturn 的控制器与响应式快照。 */
export interface InjectEntityDialogReturn<TResult = unknown, TData = unknown> {
  readonly controller: EntityDialogController<TResult, TData>;
  readonly snapshot: Signal<EntityDialogSnapshot<TResult, TData>>;
}

/** 注入响应式对话框生命周期控制器。 */
export function injectEntityDialog<TResult = unknown, TData = unknown>(
  options: AngularHeadlessOptions<EntityDialogControllerOptions<TData>> = {}
): InjectEntityDialogReturn<TResult, TData> {
  return bindController(options, createEntityDialogController<TResult, TData>, (controller, current) => {
    if (current.data !== undefined) controller.setData(current.data);
    if (current.open === true && !controller.snapshot.open) controller.open(current.data);
    if (current.open === false && controller.snapshot.open) controller.close();
  });
}
/** injectEntityDialogHeadless 的等价命名别名。 */
export const injectEntityDialogHeadless = injectEntityDialog;

/** InjectQueryTableReturn 的控制器与响应式快照。 */
export interface InjectQueryTableReturn<T extends EntityInstance = EntityInstance> {
  readonly controller: QueryTableController<T>;
  readonly snapshot: Signal<QueryTableSnapshot<T>>;
}

/** 注入响应式查询表格控制器。 */
export function injectQueryTable<T extends EntityInstance = EntityInstance>(
  options: AngularHeadlessOptions<QueryTableControllerOptions<T>> = {}
): InjectQueryTableReturn<T> {
  return bindController(options, createQueryTableController, (controller, current) => {
    if (current.query !== undefined) controller.setQuery(current.query);
    if (current.records !== undefined) controller.setRecords(current.records);
    if (current.capabilities !== undefined) controller.setCapabilities(current.capabilities);
  });
}
/** injectQueryTableHeadless 的等价命名别名。 */
export const injectQueryTableHeadless = injectQueryTable;

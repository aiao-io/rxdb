/** Angular 对共享实体状态控制器的响应式绑定。
 *
 * 这些入口只建立 signal 与 DestroyRef 订阅，不创建模板、DOM 或 VTable 实例。
 * 自定义展示层可以直接读取 `snapshot()` 并调用返回的 controller 动作。
 */
import {
  createEntityDetailController,
  createEntityDialogController,
  createEntityFormController,
  createEntityListController,
  createQueryBuilderController,
  createQueryTableController,
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
import { DestroyRef, inject, signal, type Signal } from '@angular/core';

export interface InjectEntityFormReturn {
  readonly controller: EntityFormController;
  readonly snapshot: Signal<EntityFormSnapshot>;
}

export function injectEntityForm(options: EntityFormControllerOptions): InjectEntityFormReturn {
  const controller = createEntityFormController(options);
  const snapshot = signal(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}
export const injectEntityFormHeadless = injectEntityForm;

export interface InjectQueryBuilderReturn<T = Record<string, unknown>> {
  readonly controller: QueryBuilderController<T>;
  readonly snapshot: Signal<QueryBuilderSnapshot<T>>;
}

export function injectQueryBuilder<T = Record<string, unknown>>(
  options: QueryBuilderControllerOptions<T> = {}
): InjectQueryBuilderReturn<T> {
  const controller = createQueryBuilderController(options);
  const snapshot = signal(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}
export const injectQueryBuilderHeadless = injectQueryBuilder;

export interface InjectEntityListReturn<T extends EntityInstance = EntityInstance> {
  readonly controller: EntityListController<T>;
  readonly snapshot: Signal<EntityListSnapshot<T>>;
}

export function injectEntityList<T extends EntityInstance = EntityInstance>(
  options: EntityListControllerOptions<T> = {}
): InjectEntityListReturn<T> {
  const controller = createEntityListController(options);
  const snapshot = signal(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}
export const injectEntityListHeadless = injectEntityList;

export interface InjectEntityDetailReturn {
  readonly controller: EntityDetailController;
  readonly snapshot: Signal<EntityDetailSnapshot>;
}

export function injectEntityDetail(options: EntityDetailControllerOptions): InjectEntityDetailReturn {
  const controller = createEntityDetailController(options);
  const snapshot = signal(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}
export const injectEntityDetailHeadless = injectEntityDetail;

export interface InjectEntityDialogReturn<TResult = unknown, TData = unknown> {
  readonly controller: EntityDialogController<TResult, TData>;
  readonly snapshot: Signal<EntityDialogSnapshot<TResult, TData>>;
}

export function injectEntityDialog<TResult = unknown, TData = unknown>(
  options: EntityDialogControllerOptions<TData> = {}
): InjectEntityDialogReturn<TResult, TData> {
  const controller = createEntityDialogController<TResult, TData>(options);
  const snapshot = signal(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}
export const injectEntityDialogHeadless = injectEntityDialog;

export interface InjectQueryTableReturn<T extends EntityInstance = EntityInstance> {
  readonly controller: QueryTableController<T>;
  readonly snapshot: Signal<QueryTableSnapshot<T>>;
}

export function injectQueryTable<T extends EntityInstance = EntityInstance>(
  options: QueryTableControllerOptions<T> = {}
): InjectQueryTableReturn<T> {
  const controller = createQueryTableController(options);
  const snapshot = signal(controller.snapshot);
  const unsubscribe = controller.subscribe(next => snapshot.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot: snapshot.asReadonly() };
}
export const injectQueryTableHeadless = injectQueryTable;

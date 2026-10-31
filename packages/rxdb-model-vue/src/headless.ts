/** Vue 的 headless API 聚合入口。 */
import {
  createEntityDetailController,
  createEntityDialogController,
  createEntityListController,
  createQueryBuilderController,
  createQueryTableController,
  type EntityDetailController,
  type EntityDetailControllerOptions,
  type EntityDetailSnapshot,
  type EntityDialogController,
  type EntityDialogControllerOptions,
  type EntityDialogSnapshot,
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
import { onBeforeUnmount, shallowRef, watch, type ShallowRef } from 'vue';
export { useEntityForm, useEntityFormHeadless, type UseEntityFormResult } from './entity-form/headless';

type Subscribable<TSnapshot> = { snapshot: TSnapshot; subscribe(listener: () => void): () => void; dispose(): void };
function useController<TController extends Subscribable<TSnapshot>, TSnapshot>(
  factory: () => TController
): { readonly controller: TController; readonly snapshot: ShallowRef<TSnapshot> } {
  const controller = factory();
  const snapshot = shallowRef(controller.snapshot);
  const unsubscribe = controller.subscribe(() => {
    snapshot.value = controller.snapshot;
  });
  onBeforeUnmount(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot };
}

export interface UseQueryBuilderResult<T = Record<string, unknown>> {
  readonly controller: QueryBuilderController<T>;
  readonly snapshot: ShallowRef<QueryBuilderSnapshot<T>>;
}
export function useQueryBuilder<T = Record<string, unknown>>(
  options: QueryBuilderControllerOptions<T> = {}
): UseQueryBuilderResult<T> {
  const result = useController<QueryBuilderController<T>, QueryBuilderSnapshot<T>>(() =>
    createQueryBuilderController(options)
  );
  watch(
    () => options.fields,
    fields => {
      if (fields) result.controller.setFields(fields);
    }
  );
  return result;
}
export const useQueryBuilderHeadless = useQueryBuilder;

export interface UseEntityListResult<T extends EntityInstance = EntityInstance> {
  readonly controller: EntityListController<T>;
  readonly snapshot: ShallowRef<EntityListSnapshot<T>>;
}
export function useEntityList<T extends EntityInstance = EntityInstance>(
  options: EntityListControllerOptions<T> = {}
): UseEntityListResult<T> {
  const result = useController<EntityListController<T>, EntityListSnapshot<T>>(() =>
    createEntityListController(options)
  );
  watch(
    () => options.query,
    query => {
      if (query !== undefined) result.controller.setQuery(query);
    }
  );
  watch(
    () => options.records,
    records => {
      if (records) result.controller.setRecords(records);
    }
  );
  watch([() => options.page, () => options.pageSize], ([page, pageSize]) => {
    if (page !== undefined || pageSize !== undefined)
      result.controller.setPage(page ?? 0, pageSize ?? result.controller.snapshot.pageSize);
  });
  return result;
}
export const useEntityListHeadless = useEntityList;

export interface UseEntityDetailResult {
  readonly controller: EntityDetailController;
  readonly snapshot: ShallowRef<EntityDetailSnapshot>;
}
export function useEntityDetail(options: EntityDetailControllerOptions): UseEntityDetailResult {
  const result = useController<EntityDetailController, EntityDetailSnapshot>(() =>
    createEntityDetailController(options)
  );
  watch(
    () => options.fields,
    fields => result.controller.form.setFields(fields),
    { deep: true }
  );
  watch(
    () => options.mode,
    mode => {
      if (mode) result.controller.form.setMode(mode);
    }
  );
  watch(
    () => options.data,
    data => {
      if (data) result.controller.form.setData(data);
    }
  );
  watch(
    () => options.entity,
    entity => {
      if (entity) result.controller.form.setEntity(entity);
    }
  );
  return result;
}
export const useEntityDetailHeadless = useEntityDetail;

export interface UseEntityDialogResult<TResult = unknown, TData = unknown> {
  readonly controller: EntityDialogController<TResult, TData>;
  readonly snapshot: ShallowRef<EntityDialogSnapshot<TResult, TData>>;
}
export function useEntityDialog<TResult = unknown, TData = unknown>(
  options: EntityDialogControllerOptions<TData> = {}
): UseEntityDialogResult<TResult, TData> {
  const result = useController<EntityDialogController<TResult, TData>, EntityDialogSnapshot<TResult, TData>>(() =>
    createEntityDialogController<TResult, TData>(options)
  );
  watch(
    () => options.data,
    data => {
      if (data !== undefined) result.controller.setData(data);
    }
  );
  watch(
    () => options.open,
    open => {
      if (open === true && !result.controller.snapshot.open) result.controller.open(options.data);
      else if (open === false && result.controller.snapshot.open) result.controller.close();
    }
  );
  return result;
}
export const useEntityDialogHeadless = useEntityDialog;

export interface UseQueryTableResult<T extends EntityInstance = EntityInstance> {
  readonly controller: QueryTableController<T>;
  readonly snapshot: ShallowRef<QueryTableSnapshot<T>>;
}
export function useQueryTable<T extends EntityInstance = EntityInstance>(
  options: QueryTableControllerOptions<T> = {}
): UseQueryTableResult<T> {
  const result = useController<QueryTableController<T>, QueryTableSnapshot<T>>(() =>
    createQueryTableController(options)
  );
  watch(
    () => options.query,
    query => {
      if (query !== undefined) result.controller.setQuery(query);
    }
  );
  watch(
    () => options.records,
    records => {
      if (records) result.controller.setRecords(records);
    }
  );
  return result;
}
export const useQueryTableHeadless = useQueryTable;

/** React 的 headless API 聚合入口。 */
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
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
export { useEntityForm, useEntityFormHeadless, type UseEntityFormResult } from './entity-form/headless.js';

type Subscribable<TSnapshot> = { snapshot: TSnapshot; subscribe(listener: () => void): () => void; dispose(): void };

function useController<TController extends Subscribable<TSnapshot>, TSnapshot>(
  factory: () => TController,
  update?: (controller: TController) => void
): { readonly controller: TController; readonly snapshot: TSnapshot } {
  const ref = useRef<TController | null>(null);
  if (ref.current === null) ref.current = factory();
  const controller = ref.current;
  const snapshot = useSyncExternalStore(
    listener => controller.subscribe(listener),
    () => controller.snapshot,
    () => controller.snapshot
  );
  useEffect(() => {
    update?.(controller);
  }, [controller, update]);
  useEffect(() => () => controller.dispose(), [controller]);
  return { controller, snapshot };
}

export interface UseQueryBuilderResult<T = Record<string, unknown>> {
  readonly controller: QueryBuilderController<T>;
  readonly snapshot: QueryBuilderSnapshot<T>;
}
export function useQueryBuilder<T = Record<string, unknown>>(
  options: QueryBuilderControllerOptions<T> = {}
): UseQueryBuilderResult<T> {
  const update = useCallback(
    (controller: QueryBuilderController<T>) => {
      if (options.fields) controller.setFields(options.fields);
    },
    [options.fields]
  );
  return useController(() => createQueryBuilderController(options), update);
}
export const useQueryBuilderHeadless = useQueryBuilder;

export interface UseEntityListResult<T extends EntityInstance = EntityInstance> {
  readonly controller: EntityListController<T>;
  readonly snapshot: EntityListSnapshot<T>;
}
export function useEntityList<T extends EntityInstance = EntityInstance>(
  options: EntityListControllerOptions<T> = {}
): UseEntityListResult<T> {
  const update = useCallback(
    (controller: EntityListController<T>) => {
      if (options.query !== undefined) controller.setQuery(options.query);
      if (options.records) controller.setRecords(options.records);
      if (options.page !== undefined || options.pageSize !== undefined)
        controller.setPage(options.page ?? 0, options.pageSize);
    },
    [options.query, options.records, options.page, options.pageSize]
  );
  return useController(() => createEntityListController(options), update);
}
export const useEntityListHeadless = useEntityList;

export interface UseEntityDetailResult {
  readonly controller: EntityDetailController;
  readonly snapshot: EntityDetailSnapshot;
}
export function useEntityDetail(options: EntityDetailControllerOptions): UseEntityDetailResult {
  const update = useCallback(
    (controller: EntityDetailController) => {
      controller.form.setFields(options.fields);
      controller.form.setMode(options.mode ?? 'edit');
      if (options.data) controller.form.setData(options.data);
      else if (options.entity) controller.form.setEntity(options.entity);
    },
    [options.fields, options.mode, options.data, options.entity]
  );
  return useController(() => createEntityDetailController(options), update);
}
export const useEntityDetailHeadless = useEntityDetail;

export interface UseEntityDialogResult<TResult = unknown, TData = unknown> {
  readonly controller: EntityDialogController<TResult, TData>;
  readonly snapshot: EntityDialogSnapshot<TResult, TData>;
}
export function useEntityDialog<TResult = unknown, TData = unknown>(
  options: EntityDialogControllerOptions<TData> = {}
): UseEntityDialogResult<TResult, TData> {
  const update = useCallback(
    (controller: EntityDialogController<TResult, TData>) => {
      if (options.data !== undefined) controller.setData(options.data);
      if (options.open === true && !controller.snapshot.open) controller.open(options.data);
      if (options.open === false && controller.snapshot.open) controller.close();
    },
    [options.data, options.open]
  );
  return useController(() => createEntityDialogController<TResult, TData>(options), update);
}
export const useEntityDialogHeadless = useEntityDialog;

export interface UseQueryTableResult<T extends EntityInstance = EntityInstance> {
  readonly controller: QueryTableController<T>;
  readonly snapshot: QueryTableSnapshot<T>;
}
export function useQueryTable<T extends EntityInstance = EntityInstance>(
  options: QueryTableControllerOptions<T> = {}
): UseQueryTableResult<T> {
  const update = useCallback(
    (controller: QueryTableController<T>) => {
      if (options.query !== undefined) controller.setQuery(options.query);
      if (options.records) controller.setRecords(options.records);
    },
    [options.query, options.records]
  );
  return useController(() => createQueryTableController(options), update);
}
export const useQueryTableHeadless = useQueryTable;

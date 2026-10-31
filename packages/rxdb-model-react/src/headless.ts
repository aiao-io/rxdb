/** React 的 headless API 聚合入口。 */
import {
  cloneStructured,
  createEntityDetailController,
  createEntityDialogController,
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
import { useCallback, useEffect, useRef } from 'react';
import { useControllerStore } from './controller-store.js';
export { useEntityForm, useEntityFormHeadless, type UseEntityFormResult } from './entity-form/headless.js';

type Subscribable<TSnapshot> = { snapshot: TSnapshot; subscribe(listener: () => void): () => void; dispose(): void };

function useController<TController extends Subscribable<TSnapshot>, TSnapshot>(
  factory: () => TController,
  update?: (controller: TController) => void
): { readonly controller: TController; readonly snapshot: TSnapshot } {
  const { controller, snapshot } = useControllerStore<TController, TSnapshot>(factory);
  useEffect(() => {
    update?.(controller);
  }, [controller, update]);
  return { controller, snapshot };
}

/** UseQueryBuilderResult 的控制器与响应式快照。 */
export interface UseQueryBuilderResult<T = Record<string, unknown>> {
  readonly controller: QueryBuilderController<T>;
  readonly snapshot: QueryBuilderSnapshot<T>;
}
/** React 查询构建器绑定；控制器在卸载时自动销毁。 */
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
/** useQueryBuilderHeadless 的等价命名别名。 */
export const useQueryBuilderHeadless = useQueryBuilder;

/** UseEntityListResult 的控制器与响应式快照。 */
export interface UseEntityListResult<T extends EntityInstance = EntityInstance> {
  readonly controller: EntityListController<T>;
  readonly snapshot: EntityListSnapshot<T>;
}
/** React 实体列表绑定；宿主输入变化会同步查询、记录、能力和分页状态。 */
export function useEntityList<T extends EntityInstance = EntityInstance>(
  options: EntityListControllerOptions<T> = {}
): UseEntityListResult<T> {
  const previousInput = useRef({
    query: cloneStructured(options.query),
    records: cloneStructured(options.records),
    page: options.page,
    pageSize: options.pageSize,
    capabilities: cloneStructured(options.capabilities)
  });
  const update = useCallback(
    (controller: EntityListController<T>) => {
      const previous = previousInput.current;
      if (options.query !== undefined && !structuralEqual(options.query, previous.query))
        controller.setQuery(options.query);
      if (options.records !== undefined && !structuralEqual(options.records, previous.records))
        controller.setRecords(options.records);
      if (
        (options.page !== previous.page || options.pageSize !== previous.pageSize) &&
        (options.page !== undefined || options.pageSize !== undefined)
      )
        controller.setPage(options.page ?? 0, options.pageSize);
      if (!structuralEqual(options.capabilities, previous.capabilities))
        controller.setCapabilities(options.capabilities);
      previousInput.current = {
        query: cloneStructured(options.query),
        records: cloneStructured(options.records),
        page: options.page,
        pageSize: options.pageSize,
        capabilities: cloneStructured(options.capabilities)
      };
    },
    [options.query, options.records, options.page, options.pageSize, options.capabilities]
  );
  return useController(() => createEntityListController(options), update);
}
/** useEntityListHeadless 的等价命名别名。 */
export const useEntityListHeadless = useEntityList;

/** UseEntityDetailResult 的控制器与响应式快照。 */
export interface UseEntityDetailResult {
  readonly controller: EntityDetailController;
  readonly snapshot: EntityDetailSnapshot;
}
/** React 实体详情绑定；字段/模式变更不重置未提交草稿。 */
export function useEntityDetail(options: EntityDetailControllerOptions): UseEntityDetailResult {
  const update = useCallback(
    (controller: EntityDetailController) => {
      controller.form.setFields(options.fields);
      controller.form.setMode(options.mode ?? 'edit');
      controller.form.setRelatedEntityProvider(options.relatedEntityProvider);
    },
    [options.fields, options.mode, options.relatedEntityProvider]
  );
  const result = useController<EntityDetailController, EntityDetailSnapshot>(
    () => createEntityDetailController(options),
    update
  );
  const previousInput = useRef<{
    data?: EntityDetailControllerOptions['data'];
    entity?: EntityDetailControllerOptions['entity'];
  }>({
    data: cloneStructured(options.data),
    entity: cloneStructured(options.entity)
  });
  useEffect(() => {
    const previous = previousInput.current;
    if (options.data !== undefined && !structuralEqual(options.data, previous.data))
      result.controller.form.setData(options.data);
    else if (
      options.entity !== undefined &&
      options.data === undefined &&
      !structuralEqual(options.entity, previous.entity)
    )
      result.controller.form.setEntity(options.entity);
    previousInput.current = { data: cloneStructured(options.data), entity: cloneStructured(options.entity) };
  }, [result.controller, options.data, options.entity]);
  return result;
}
/** useEntityDetailHeadless 的等价命名别名。 */
export const useEntityDetailHeadless = useEntityDetail;

/** UseEntityDialogResult 的控制器与响应式快照。 */
export interface UseEntityDialogResult<TResult = unknown, TData = unknown> {
  readonly controller: EntityDialogController<TResult, TData>;
  readonly snapshot: EntityDialogSnapshot<TResult, TData>;
}
/** React 对话框生命周期绑定。 */
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
/** useEntityDialogHeadless 的等价命名别名。 */
export const useEntityDialogHeadless = useEntityDialog;

/** UseQueryTableResult 的控制器与响应式快照。 */
export interface UseQueryTableResult<T extends EntityInstance = EntityInstance> {
  readonly controller: QueryTableController<T>;
  readonly snapshot: QueryTableSnapshot<T>;
}
/** React 查询表格状态绑定。 */
export function useQueryTable<T extends EntityInstance = EntityInstance>(
  options: QueryTableControllerOptions<T> = {}
): UseQueryTableResult<T> {
  const previousInput = useRef({
    query: cloneStructured(options.query),
    records: cloneStructured(options.records),
    capabilities: cloneStructured(options.capabilities)
  });
  const update = useCallback(
    (controller: QueryTableController<T>) => {
      const previous = previousInput.current;
      if (options.query !== undefined && !structuralEqual(options.query, previous.query))
        controller.setQuery(options.query);
      if (options.records !== undefined && !structuralEqual(options.records, previous.records))
        controller.setRecords(options.records);
      if (!structuralEqual(options.capabilities, previous.capabilities))
        controller.setCapabilities(options.capabilities);
      previousInput.current = {
        query: cloneStructured(options.query),
        records: cloneStructured(options.records),
        capabilities: cloneStructured(options.capabilities)
      };
    },
    [options.query, options.records, options.capabilities]
  );
  return useController(() => createQueryTableController(options), update);
}
/** useQueryTableHeadless 的等价命名别名。 */
export const useQueryTableHeadless = useQueryTable;

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

/** UseQueryBuilderResult 的控制器与响应式快照。 */
export interface UseQueryBuilderResult<T = Record<string, unknown>> {
  readonly controller: QueryBuilderController<T>;
  readonly snapshot: ShallowRef<QueryBuilderSnapshot<T>>;
}
/** Vue 查询构建器绑定，深度同步字段元数据。 */
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
    },
    { deep: true, immediate: true }
  );
  return result;
}
/** useQueryBuilderHeadless 的等价命名别名。 */
export const useQueryBuilderHeadless = useQueryBuilder;

/** UseEntityListResult 的控制器与响应式快照。 */
export interface UseEntityListResult<T extends EntityInstance = EntityInstance> {
  readonly controller: EntityListController<T>;
  readonly snapshot: ShallowRef<EntityListSnapshot<T>>;
}
/** Vue 实体列表绑定，深度同步查询、记录、分页和能力。 */
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
    },
    { deep: true, immediate: true }
  );
  watch(
    () => options.records,
    records => {
      if (records) result.controller.setRecords(records);
    },
    { deep: true, immediate: true }
  );
  watch(
    [() => options.page, () => options.pageSize],
    ([page, pageSize]) => {
      if (page !== undefined || pageSize !== undefined)
        result.controller.setPage(page ?? 0, pageSize ?? result.controller.snapshot.pageSize);
    },
    { immediate: true }
  );
  watch(
    () => options.capabilities,
    capabilities => result.controller.setCapabilities(capabilities),
    { deep: true, immediate: true }
  );
  return result;
}
/** useEntityListHeadless 的等价命名别名。 */
export const useEntityListHeadless = useEntityList;

/** UseEntityDetailResult 的控制器与响应式快照。 */
export interface UseEntityDetailResult {
  readonly controller: EntityDetailController;
  readonly snapshot: ShallowRef<EntityDetailSnapshot>;
}
/** Vue 实体详情绑定；配置变更不会丢弃草稿。 */
export function useEntityDetail(options: EntityDetailControllerOptions): UseEntityDetailResult {
  const result = useController<EntityDetailController, EntityDetailSnapshot>(() =>
    createEntityDetailController(options)
  );
  watch(
    () => options.fields,
    fields => result.controller.form.setFields(fields),
    { deep: true, immediate: true }
  );
  watch(
    () => options.mode,
    mode => {
      if (mode) result.controller.form.setMode(mode);
    },
    { immediate: true }
  );
  watch(
    () => options.relatedEntityProvider,
    provider => result.controller.form.setRelatedEntityProvider(provider),
    { immediate: true }
  );
  watch(
    [() => options.data, () => options.entity],
    ([data, entity]) => {
      if (data !== undefined) result.controller.form.setData(data);
      else if (entity !== undefined) result.controller.form.setEntity(entity);
    },
    { deep: true, immediate: true }
  );
  return result;
}
/** useEntityDetailHeadless 的等价命名别名。 */
export const useEntityDetailHeadless = useEntityDetail;

/** UseEntityDialogResult 的控制器与响应式快照。 */
export interface UseEntityDialogResult<TResult = unknown, TData = unknown> {
  readonly controller: EntityDialogController<TResult, TData>;
  readonly snapshot: ShallowRef<EntityDialogSnapshot<TResult, TData>>;
}
/** Vue 对话框生命周期绑定。 */
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
    },
    { deep: true, immediate: true }
  );
  watch(
    () => options.open,
    open => {
      if (open === true && !result.controller.snapshot.open) result.controller.open(options.data);
      else if (open === false && result.controller.snapshot.open) result.controller.close();
    },
    { immediate: true }
  );
  return result;
}
/** useEntityDialogHeadless 的等价命名别名。 */
export const useEntityDialogHeadless = useEntityDialog;

/** UseQueryTableResult 的控制器与响应式快照。 */
export interface UseQueryTableResult<T extends EntityInstance = EntityInstance> {
  readonly controller: QueryTableController<T>;
  readonly snapshot: ShallowRef<QueryTableSnapshot<T>>;
}
/** Vue 查询表格状态绑定。 */
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
    },
    { deep: true, immediate: true }
  );
  watch(
    () => options.records,
    records => {
      if (records) result.controller.setRecords(records);
    },
    { deep: true, immediate: true }
  );
  return result;
}
/** useQueryTableHeadless 的等价命名别名。 */
export const useQueryTableHeadless = useQueryTable;

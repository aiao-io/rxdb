/** React 对 EntityFormController 的响应式绑定。 */
import {
  cloneStructured,
  createEntityFormController,
  structuralEqual,
  type EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot
} from '@aiao/rxdb-model/headless';
import { useEffect, useRef } from 'react';
import { useControllerStore } from '../controller-store.js';

/** React headless 表单返回值。 */
export interface UseEntityFormResult {
  readonly controller: EntityFormController;
  readonly snapshot: EntityFormSnapshot;
}

/**
 * 将共享表单状态绑定到 React 生命周期。
 * @remarks 字段和模式变化保留草稿；宿主数据语义变化才重置。控制器随组件 state 保留，
 * StrictMode 回放与 `<Activity>` 隐藏后重显都沿用同一实例。
 */
export function useEntityForm(options: EntityFormControllerOptions): UseEntityFormResult {
  const { controller, snapshot } = useControllerStore<EntityFormController, EntityFormSnapshot>(() =>
    createEntityFormController(options)
  );
  const previousInput = useRef<{
    data?: EntityFormControllerOptions['data'];
    entity?: EntityFormControllerOptions['entity'];
  }>({
    data: cloneStructured(options.data),
    entity: cloneStructured(options.entity)
  });
  useEffect(() => {
    controller.setFields(options.fields);
  }, [controller, options.fields]);
  useEffect(() => {
    controller.setMode(options.mode ?? 'edit');
  }, [controller, options.mode]);
  useEffect(() => {
    controller.setRelatedEntityProvider(options.relatedEntityProvider);
  }, [controller, options.relatedEntityProvider]);
  useEffect(() => {
    const previous = previousInput.current;
    if (options.data !== undefined && !structuralEqual(options.data, previous.data)) controller.setData(options.data);
    else if (
      options.data === undefined &&
      options.entity !== undefined &&
      !structuralEqual(options.entity, previous.entity)
    ) {
      controller.setEntity(options.entity);
    }
    previousInput.current = { data: cloneStructured(options.data), entity: cloneStructured(options.entity) };
  }, [controller, options.data, options.entity]);
  return { controller, snapshot };
}

/** 便于组合式 API 使用的命名别名。 */
export const useEntityFormHeadless = useEntityForm;

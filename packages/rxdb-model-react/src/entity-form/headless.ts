/** React 对 EntityFormController 的响应式绑定。 */
import {
  createEntityFormController,
  type EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot
} from '@aiao/rxdb-model/headless';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/** React headless 表单返回值。 */
export interface UseEntityFormResult {
  readonly controller: EntityFormController;
  readonly snapshot: EntityFormSnapshot;
}

/**
 * 将共享表单状态绑定到 React 生命周期。
 * @remarks `data`、`fields` 或 `mode` 变化时会同步到同一个控制器；卸载时自动释放订阅。
 */
export function useEntityForm(options: EntityFormControllerOptions): UseEntityFormResult {
  const controllerRef = useRef<EntityFormController | null>(null);
  if (controllerRef.current === null) controllerRef.current = createEntityFormController(options);
  const controller = controllerRef.current;
  const snapshot = useSyncExternalStore(
    listener => controller.subscribe(() => listener()),
    () => controller.snapshot,
    () => controller.snapshot
  );
  useEffect(() => {
    controller.setFields(options.fields);
  }, [controller, options.fields]);
  useEffect(() => {
    controller.setMode(options.mode ?? 'edit');
  }, [controller, options.mode]);
  useEffect(() => {
    if (options.data) controller.setData(options.data);
    else if (options.entity) controller.setEntity(options.entity);
  }, [controller, options.data, options.entity]);
  useEffect(() => () => controller.dispose(), [controller]);
  return { controller, snapshot };
}

/** 便于组合式 API 使用的命名别名。 */
export const useEntityFormHeadless = useEntityForm;

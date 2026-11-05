/** Vue 对 EntityFormController 的响应式绑定。 */
import {
  createEntityFormController,
  type EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot
} from '@aiao/rxdb-model/headless';
import { onBeforeUnmount, shallowRef, watch, type ShallowRef } from 'vue';

/** UseEntityFormResult 的控制器与响应式快照。 */
export interface UseEntityFormResult {
  readonly controller: EntityFormController;
  readonly snapshot: ShallowRef<EntityFormSnapshot>;
}

/** Vue 表单绑定；深度同步宿主数据并在卸载时释放控制器。 */
export function useEntityForm(options: EntityFormControllerOptions): UseEntityFormResult {
  const controller = createEntityFormController(options);
  const snapshot = shallowRef(controller.snapshot);
  const unsubscribe = controller.subscribe(next => {
    snapshot.value = next;
  });
  watch(
    () => options.fields,
    fields => controller.setFields(fields),
    { deep: true, immediate: true }
  );
  watch(
    () => options.mode,
    mode => {
      if (mode) controller.setMode(mode);
    },
    { immediate: true }
  );
  watch(
    () => options.relatedEntityProvider,
    provider => controller.setRelatedEntityProvider(provider),
    { immediate: true }
  );
  watch(
    [() => options.data, () => options.entity],
    ([data, entity]) => {
      if (data !== undefined) controller.setData(data);
      else if (entity !== undefined) controller.setEntity(entity);
    },
    { deep: true, immediate: true }
  );
  onBeforeUnmount(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot };
}

/** useEntityFormHeadless 的等价命名别名。 */
export const useEntityFormHeadless = useEntityForm;

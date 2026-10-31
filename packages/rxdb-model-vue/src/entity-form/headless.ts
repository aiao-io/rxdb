/** Vue 对 EntityFormController 的响应式绑定。 */
import {
  createEntityFormController,
  type EntityFormController,
  type EntityFormControllerOptions,
  type EntityFormSnapshot
} from '@aiao/rxdb-model/headless';
import { onBeforeUnmount, onMounted, shallowRef, watch, type ShallowRef } from 'vue';

export interface UseEntityFormResult {
  readonly controller: EntityFormController;
  readonly snapshot: ShallowRef<EntityFormSnapshot>;
}

/** 将共享表单状态绑定到 Vue 生命周期。 */
export function useEntityForm(options: EntityFormControllerOptions): UseEntityFormResult {
  const controller = createEntityFormController(options);
  const snapshot = shallowRef(controller.snapshot);
  const unsubscribe = controller.subscribe(next => {
    snapshot.value = next;
  });
  onMounted(() => {
    if (options.data) controller.setData(options.data);
    else if (options.entity) controller.setEntity(options.entity);
  });
  watch(
    () => options.fields,
    fields => controller.setFields(fields),
    { deep: true }
  );
  watch(
    () => options.mode,
    mode => {
      if (mode) controller.setMode(mode);
    }
  );
  onBeforeUnmount(() => {
    unsubscribe();
    controller.dispose();
  });
  return { controller, snapshot };
}

export const useEntityFormHeadless = useEntityForm;

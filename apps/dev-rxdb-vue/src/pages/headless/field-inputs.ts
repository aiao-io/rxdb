import type { EntityFormController } from '@aiao/rxdb-model/headless';
import { onBeforeUnmount, reactive } from 'vue';

/** 控件 id：前缀与区块标题的 id 分开命名，避免字段名恰好叫 `title` 时与标题元素撞 id。 */
export const fieldId = (prefix: string, field: string): string => `${prefix}-field-${field}`;

/** 表单输入的本地状态：原始文本、已触碰字段、是否尝试过提交。 */
export interface FieldInputState {
  raw: Record<string, string>;
  touched: Set<string>;
  attempted: boolean;
}

/** 表单输入状态及其动作。 */
export interface FieldInputs {
  readonly state: FieldInputState;
  input(field: string, value: unknown): void;
  markAttempted(): void;
}

/**
 * 管理控件的原始输入文本。
 *
 * 控制器只保存解析后的合法值；解析失败时用户键入的文本仍要留在控件里，所以由消费方保存原始文本，
 * 并在宿主重置 / 取消（控制器发出 `reset` / `cancelled`）时清空。
 */
export function useFieldInputs(controller: EntityFormController): FieldInputs {
  const state = reactive<FieldInputState>({ raw: {}, touched: new Set(), attempted: false });
  const stop = controller.subscribe((_snapshot, event) => {
    if (event.type !== 'reset' && event.type !== 'cancelled') return;
    state.raw = {};
    state.touched.clear();
    state.attempted = false;
  });
  onBeforeUnmount(stop);
  return {
    state,
    input(field, value) {
      if (typeof value === 'string') state.raw[field] = value;
      state.touched.add(field);
      controller.setField(field, value);
    },
    markAttempted() {
      state.attempted = true;
    }
  };
}

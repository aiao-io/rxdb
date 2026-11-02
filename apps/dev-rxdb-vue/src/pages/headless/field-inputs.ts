import type { EntityFormController } from '@aiao/rxdb-model/headless';
import { onBeforeUnmount, reactive } from 'vue';

/** 控件 id：前缀与区块标题的 id 分开命名，避免字段名恰好叫 `title` 时与标题元素撞 id。 */
export const fieldId = (prefix: string, field: string): string => `${prefix}-field-${field}`;

/** 表单输入的本地状态：用户键入的原始文本（有键即“已触碰”）与是否尝试过提交。 */
export interface FieldInputState {
  raw: Record<string, string>;
  attempted: boolean;
}

/** 表单输入状态及其动作。 */
export interface FieldInputs {
  readonly state: FieldInputState;
  input(field: string, value: string): void;
  markAttempted(): void;
}

/**
 * 管理控件的原始输入文本。
 *
 * 控制器保存解析后的合法值，并私下记着尚未修正的解析失败（用来按当前语言重生成错误文案）；
 * 控件要回显用户键入的文本，仍由消费方保存，并在宿主重置 / 取消（控制器发出 `reset` / `cancelled`）时清空。
 */
export function useFieldInputs(controller: EntityFormController): FieldInputs {
  const state = reactive<FieldInputState>({ raw: {}, attempted: false });
  onBeforeUnmount(
    controller.subscribe((_snapshot, event) => {
      if (event.type !== 'reset' && event.type !== 'cancelled') return;
      state.raw = {};
      state.attempted = false;
    })
  );
  return {
    state,
    input(field, value) {
      state.raw[field] = value;
      controller.setField(field, value);
    },
    markAttempted() {
      state.attempted = true;
    }
  };
}

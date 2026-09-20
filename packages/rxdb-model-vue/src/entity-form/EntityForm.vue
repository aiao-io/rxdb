<script lang="ts" setup>
/**
 * 元数据驱动表单组件：按字段类型渲染对应输入控件，支持 create / edit / view 三模式；
 * 解析、格式化与校验全部委托 `@aiao/rxdb-model`。
 *
 * 对齐 Angular 侧 `EntityFormComponent`：字段控件、只读展示、操作按钮与
 * 四条输出链路（fieldChanged / formSubmitted / formCancelled / validationErrors）
 * 逐项等价，模板文案逐字一致。
 */
import type {
  EntityFieldType,
  EntityFormData,
  FormFieldChangeEvent,
  FormFieldConfig,
  FormMode,
  FormValidationResult,
  RelatedEntityItem,
  RelatedEntityProvider
} from '@aiao/rxdb-model';
import { formatEntityFieldValue, parseEntityFieldValueStrict, validateForm } from '@aiao/rxdb-model';
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 字段配置 */
    fields: FormFieldConfig[];
    /** 表单数据 */
    data: EntityFormData;
    /** 表单模式 */
    mode?: FormMode;
    /** 关系实体候选提供者 */
    relatedEntityProvider?: RelatedEntityProvider;
    /** 是否渲染保存/取消操作按钮 */
    showActions?: boolean;
  }>(),
  { mode: 'view', showActions: true, relatedEntityProvider: undefined }
);

const emit = defineEmits<{
  /** 字段值变更 */
  fieldChanged: [event: FormFieldChangeEvent];
  /** 表单提交 */
  formSubmitted: [data: EntityFormData];
  /** 表单取消 */
  formCancelled: [];
  /** 校验错误 */
  validationErrors: [result: FormValidationResult];
}>();

/** 初始数据（data 属性变化时重置） */
const initialData = ref<EntityFormData>({ ...props.data });
/** 当前编辑数据（取消时回到 initialData） */
const formData = ref<EntityFormData>({ ...initialData.value });

watch(
  () => props.data,
  data => {
    initialData.value = { ...data };
    formData.value = { ...data };
  }
);

/** 可编辑字段（隐藏字段不渲染） */
const editableFields = computed(() => props.fields.filter(f => !f.hidden));

/** view 模式整体只读 */
const isReadonly = computed(() => props.mode === 'view');

/** 关系字段候选（field → 关联实体条目列表） */
const relatedItemsMap = computed(() => {
  const provider = props.relatedEntityProvider;
  const map = new Map<string, RelatedEntityItem[]>();
  if (!provider) return map;
  for (const field of editableFields.value) {
    if (field.relatedEntityName) {
      map.set(field.field, provider(field.relatedEntityName, field.relatedNamespace));
    }
  }
  return map;
});

/** 只读字段的展示值（field → 格式化字符串） */
const displayValueMap = computed(() => {
  const data = formData.value;
  const fields = editableFields.value;
  const itemsMap = relatedItemsMap.value;
  const map = new Map<string, string>();
  for (const field of fields) {
    if (!isReadonly.value && field.readonly !== true) continue;
    const value = data[field.field];
    if ((field.type === 'oneToOne' || field.type === 'manyToOne') && field.relatedEntityName) {
      const items = itemsMap.get(field.field) ?? [];
      const item = items.find(i => i.id === value);
      map.set(field.field, item?.displayName ?? formatEntityFieldValue(field.type, value, field.format));
    } else if (field.type === 'enum' && field.options) {
      const label = field.options[String(value)]?.label;
      map.set(field.field, label ?? formatEntityFieldValue(field.type, value, field.format));
    } else if (field.type === 'stringArray' && field.options) {
      const items =
        Array.isArray(value) ? value
        : typeof value === 'string' ? value.split(',')
        : [];
      map.set(field.field, items.map(v => field.options![String(v).trim()]?.label ?? String(v).trim()).join(', '));
    } else {
      map.set(field.field, formatEntityFieldValue(field.type, value, field.format));
    }
  }
  return map;
});

/** 字段变更：统一解析链路（解析失败 emit validationErrors 且不更新数据） */
const onFieldChange = (field: FormFieldConfig, rawValue: unknown): void => {
  const current = formData.value;
  const previousValue = current[field.field];
  const result = parseEntityFieldValueStrict(field.type, rawValue);
  if (!result.ok) {
    emit('validationErrors', {
      valid: false,
      errors: [{ field: field.field, message: `${field.displayName} ${result.message}` }]
    });
    return;
  }
  const parsed = result.value;
  formData.value = { ...current, [field.field]: parsed };
  emit('fieldChanged', { field: field.field, type: field.type as EntityFieldType, value: parsed, previousValue });
};

/** 表单提交：校验通过才 emit formSubmitted */
const onSubmit = (): void => {
  const result = validateForm(props.fields, formData.value);
  if (!result.valid) {
    emit('validationErrors', result);
    return;
  }
  emit('formSubmitted', formData.value);
};

/** 取消：重置为初始数据并 emit formCancelled */
const onCancel = (): void => {
  formData.value = { ...initialData.value };
  emit('formCancelled');
};

/** 字段是否只读展示 */
const isFieldReadonly = (field: FormFieldConfig): boolean => isReadonly.value || field.readonly === true;

/** 占据两列栅格的字段：json / keyValue / binary / 多行文本类 format / 显式 span */
const isWideField = (field: FormFieldConfig): boolean =>
  field.span === 2 ||
  field.type === 'json' ||
  field.type === 'keyValue' ||
  field.type === 'binary' ||
  isTextareaFormat(field);

/** 多行文本类 format：渲染 textarea */
const isTextareaFormat = (field: FormFieldConfig): boolean => {
  const kind = field.format?.kind;
  return kind === 'multilineText' || kind === 'richText' || kind === 'code';
};

/** dateTime format 的显示模式映射到原生输入类型 */
const dateInputType = (field: FormFieldConfig): 'date' | 'datetime-local' | 'time' => {
  const format = field.format;
  if (format?.kind === 'dateTime') {
    if (format.display === 'date') return 'date';
    if (format.display === 'time') return 'time';
  }
  return 'datetime-local';
};

/** dateTime format 的显示模式映射到日期格式（对齐 Angular DatePipe 格式） */
const datePipeFormat = (field: FormFieldConfig): string => {
  const format = field.format;
  if (format?.kind === 'dateTime') {
    if (format.display === 'date') return 'yyyy-MM-dd';
    if (format.display === 'time') return 'HH:mm';
  }
  return 'yyyy-MM-ddTHH:mm';
};

/** 数字类 format 的值域约束（min / max / step） */
const numericBounds = (field: FormFieldConfig): { min?: number; max?: number; step?: number } => {
  const format = field.format;
  if (
    format &&
    (format.kind === 'number' ||
      format.kind === 'currency' ||
      format.kind === 'percentage' ||
      format.kind === 'duration' ||
      format.kind === 'rating')
  ) {
    return {
      ...(format.min === undefined ? {} : { min: format.min }),
      ...(format.max === undefined ? {} : { max: format.max }),
      ...(format.step === undefined ? {} : { step: format.step })
    };
  }
  return {};
};

/** 数字类 format 的单位标注（currency 代码 / 百分号 / 时长单位） */
const numericUnitLabel = (field: FormFieldConfig): string => {
  switch (field.format?.kind) {
    case 'currency':
      return field.format.currency;
    case 'percentage':
      return '%';
    case 'duration':
      return field.format.unit;
    default:
      return '';
  }
};

/** enum / 多选值的展示 label（无 options 时退回原值） */
const enumOptionLabel = (field: FormFieldConfig, value: string): string => field.options?.[value]?.label ?? value;

/** options 中声明 disabled 的值不可选 */
const enumOptionDisabled = (field: FormFieldConfig, value: string): boolean =>
  field.options?.[value]?.disabled === true;

/** 字符串 format 映射到原生输入类型 */
const textInputType = (field: FormFieldConfig): string => {
  switch (field.format?.kind) {
    case 'url':
      return 'url';
    case 'email':
      return 'email';
    case 'phone':
      return 'tel';
    default:
      return 'text';
  }
};

/** 取色器回显值：非法或空值退回黑色 */
const colorValue = (field: FormFieldConfig): string => {
  const value = formData.value[field.field];
  return (
    typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value) ?
      value.startsWith('#') ?
        value
      : `#${value}`
    : '#000000'
  );
};

/** 字节序列回显为 hex 字符串 */
const binaryToHex = (value: unknown): string =>
  value instanceof Uint8Array ? Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('') : '';

/** 复选组的当前选中状态（支持数组与逗号字符串两种存储形态） */
const multiSelected = (field: FormFieldConfig, value: string): boolean => {
  const current = formData.value[field.field];
  if (Array.isArray(current)) return current.includes(value);
  if (typeof current === 'string')
    return current
      .split(',')
      .map(s => s.trim())
      .includes(value);
  return false;
};

/** 复选组切换：合并出新数组后走统一解析链路 */
const onMultiSelectChange = (field: FormFieldConfig, value: string, checked: boolean): void => {
  const current = formData.value[field.field];
  const list =
    Array.isArray(current) ? [...(current as string[])]
    : typeof current === 'string' ?
      current
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];
  const next = checked ? [...list, value] : list.filter(v => v !== value);
  onFieldChange(field, next);
};

/** 数组类字段的输入回显（数组 → 逗号分隔字符串） */
const arrayJoin = (value: unknown): string => (Array.isArray(value) ? value : []).join(', ');

/** JSON 类字段的输入回显（null → 空串） */
const jsonOrEmpty = (value: unknown): string => (value !== null ? JSON.stringify(value) : '');

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** 输入控件的回显值（string / number 原样；null / undefined 回退空串；其余 String 化） */
const displayInputValue = (field: FormFieldConfig): string | number => {
  const v = formData.value[field.field];
  if (v === null || v === undefined) return '';
  return typeof v === 'string' || typeof v === 'number' ? v : String(v);
};

/** 日期类字段的输入回显（对齐 Angular DatePipe 的 yyyy-MM-dd / HH:mm / yyyy-MM-ddTHH:mm） */
const dateInputValue = (field: FormFieldConfig): string => {
  const value = formData.value[field.field];
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const format = datePipeFormat(field);
  const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (format === 'yyyy-MM-dd') return datePart;
  if (format === 'HH:mm') return timePart;
  return `${datePart}T${timePart}`;
};

defineExpose({
  initialData,
  formData,
  editableFields,
  isReadonly,
  relatedItemsMap,
  displayValueMap,
  onFieldChange,
  onSubmit,
  onCancel,
  isFieldReadonly,
  isWideField,
  isTextareaFormat,
  dateInputType,
  datePipeFormat,
  numericBounds,
  numericUnitLabel,
  enumOptionLabel,
  enumOptionDisabled,
  textInputType,
  colorValue,
  binaryToHex,
  multiSelected,
  onMultiSelectChange,
  displayInputValue
});
</script>

<template>
  <form
    class="grid grid-cols-1 gap-4 md:grid-cols-2"
    @submit.prevent="onSubmit"
  >
    <fieldset
      class="fieldset"
      v-for="field in editableFields"
      :class="{ 'md:col-span-2': isWideField(field) }"
      :key="field.field"
    >
      <legend class="fieldset-legend">
        {{ field.displayName }}
      </legend>
      <div
        class="input input-ghost flex min-h-10 items-center"
        v-if="isFieldReadonly(field)"
      >
        {{ displayValueMap.get(field.field) ?? '' }}
      </div>
      <template v-else>
        <template v-if="field.type === 'boolean'">
          <input
            class="toggle"
            :checked="!!formData[field.field]"
            @change="onFieldChange(field, ($event.target as HTMLInputElement).checked)"
            type="checkbox"
          />
        </template>
        <select
          class="select"
          v-else-if="field.type === 'enum'"
          :value="displayInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-if="field.nullable"
            value=""
          >
            (空)
          </option>
          <option
            v-for="val in field.enumValues ?? []"
            :disabled="enumOptionDisabled(field, val)"
            :key="val"
            :value="val"
          >
            {{ enumOptionLabel(field, val) }}
          </option>
        </select>
        <input
          class="input"
          v-else-if="field.type === 'date'"
          :type="dateInputType(field)"
          :value="dateInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
        />
        <div
          class="flex items-center gap-2"
          v-else-if="field.type === 'number'"
        >
          <input
            class="input flex-1"
            :max="numericBounds(field).max"
            :min="numericBounds(field).min"
            :placeholder="field.placeholder ?? ''"
            :step="numericBounds(field).step ?? 'any'"
            :value="displayInputValue(field)"
            @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
            type="number"
          />
          <span
            class="label w-10 shrink-0"
            v-if="numericUnitLabel(field)"
            >{{ numericUnitLabel(field) }}</span
          >
        </div>
        <div
          class="flex items-center gap-2"
          v-else-if="field.type === 'integer'"
        >
          <input
            class="input flex-1"
            :max="numericBounds(field).max"
            :min="numericBounds(field).min"
            :placeholder="field.placeholder ?? ''"
            :step="numericBounds(field).step ?? '1'"
            :value="displayInputValue(field)"
            @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
            type="number"
          />
          <span
            class="label w-10 shrink-0"
            v-if="numericUnitLabel(field)"
            >{{ numericUnitLabel(field) }}</span
          >
        </div>
        <input
          class="input"
          v-else-if="field.type === 'bigint'"
          :placeholder="field.placeholder ?? ''"
          :value="displayInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
          inputmode="numeric"
          type="text"
        />
        <textarea
          class="textarea min-h-16 font-mono"
          v-else-if="field.type === 'binary'"
          :placeholder="field.placeholder ?? '十六进制字节序列（如 0a0b）'"
          :value="binaryToHex(formData[field.field])"
          @change="onFieldChange(field, ($event.target as HTMLTextAreaElement).value)"
        />
        <div
          class="flex flex-col gap-1"
          v-else-if="field.type === 'stringArray' && field.enumValues && field.enumValues.length > 0"
        >
          <label
            class="flex items-center gap-2"
            v-for="val in field.enumValues"
            :key="val"
          >
            <input
              class="checkbox"
              :checked="multiSelected(field, val)"
              :disabled="enumOptionDisabled(field, val)"
              @change="onMultiSelectChange(field, val, ($event.target as HTMLInputElement).checked)"
              type="checkbox"
            />
            <span
              class="inline-block h-2 w-2 rounded-full"
              v-if="field.options?.[val]?.color"
              :style="{ background: field.options?.[val]?.color }"
            />
            <span>{{ enumOptionLabel(field, val) }}</span>
          </label>
        </div>
        <input
          class="input"
          v-else-if="field.type === 'stringArray'"
          :placeholder="field.placeholder ?? '逗号分隔'"
          :value="arrayJoin(formData[field.field] ?? [])"
          @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
          type="text"
        />
        <input
          class="input"
          v-else-if="field.type === 'numberArray'"
          :placeholder="field.placeholder ?? '逗号分隔数字'"
          :value="arrayJoin(formData[field.field] ?? [])"
          @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
          type="text"
        />
        <textarea
          class="textarea min-h-24"
          v-else-if="field.type === 'json'"
          :placeholder="field.placeholder ?? 'JSON'"
          :value="jsonOrEmpty(formData[field.field])"
          @change="onFieldChange(field, ($event.target as HTMLTextAreaElement).value)"
        />
        <textarea
          class="textarea min-h-24"
          v-else-if="field.type === 'keyValue'"
          :placeholder="field.placeholder ?? 'JSON'"
          :value="jsonOrEmpty(formData[field.field])"
          @change="onFieldChange(field, ($event.target as HTMLTextAreaElement).value)"
        />
        <select
          class="select"
          v-else-if="field.type === 'oneToOne'"
          :value="displayInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLSelectElement).value)"
        >
          <option value=""> (空) </option>
          <option
            v-for="item in relatedItemsMap.get(field.field) ?? []"
            :key="item.id"
            :value="item.id"
          >
            {{ item.displayName }}
          </option>
        </select>
        <select
          class="select"
          v-else-if="field.type === 'manyToOne'"
          :value="displayInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLSelectElement).value)"
        >
          <option value=""> (空) </option>
          <option
            v-for="item in relatedItemsMap.get(field.field) ?? []"
            :key="item.id"
            :value="item.id"
          >
            {{ item.displayName }}
          </option>
        </select>
        <div
          class="flex items-center gap-2"
          v-else-if="field.format?.kind === 'color'"
        >
          <input
            class="h-9 w-12 cursor-pointer border-0 bg-transparent"
            :value="colorValue(field)"
            @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
            type="color"
          />
          <input
            class="input flex-1"
            :placeholder="field.placeholder ?? '#rrggbb'"
            :value="displayInputValue(field)"
            @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
            type="text"
          />
        </div>
        <textarea
          class="textarea min-h-16"
          v-else-if="isTextareaFormat(field)"
          :placeholder="field.placeholder ?? ''"
          :value="displayInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLTextAreaElement).value)"
        />
        <input
          class="input"
          v-else
          :placeholder="field.placeholder ?? ''"
          :type="textInputType(field)"
          :value="displayInputValue(field)"
          @change="onFieldChange(field, ($event.target as HTMLInputElement).value)"
        />
      </template>
      <p
        class="label"
        v-if="field.helpText"
      >
        {{ field.helpText }}
      </p>
    </fieldset>
    <div
      class="flex justify-end gap-2 pt-2 md:col-span-2"
      v-if="!isReadonly && showActions"
    >
      <button
        class="btn"
        @click="onCancel"
        type="button"
      >
        取消
      </button>
      <button
        class="btn btn-primary"
        type="submit"
      >
        保存
      </button>
    </div>
  </form>
</template>

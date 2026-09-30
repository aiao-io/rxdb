<script lang="ts" setup>
/**
 * 值输入组件（对齐 Angular 侧 `ValueInputComponent`）。
 *
 * 根据字段类型和操作符显示合适的输入控件：
 * - string / uuid / number / boolean / date / enum / enum-array / array / range / none / subquery；
 * - null / notNull 操作符无输入；exists / notExists 操作符内嵌 {@link SubqueryBuilder}；
 * - 每个 handler 都走「更新内部状态 + emit valueChange + 调 valueChangeFn 回调」三件事。
 */
import {
  getDefaultValueForType as coreGetDefaultValue,
  getInputType as coreGetInputType,
  parseCommaSeparatedInput,
  UUID_RE,
  type FieldMetadata,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model';
import { computed, ref, watch } from 'vue';
import PopoverSelect from '../popover-select/PopoverSelect.vue';
import SubqueryBuilder from '../subquery-builder/SubqueryBuilder.vue';

const props = withDefaults(
  defineProps<{
    /** 字段类型 */
    fieldType?: string;
    /** 操作符 */
    operator?: string;
    /** 当前值 */
    value?: unknown;
    /** 枚举选项 */
    enumOptions?: unknown[];
    /** 关系目标实体字段（EXISTS 子查询用） */
    relationFields?: FieldMetadata[];
    /** 规则的 where 子查询 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    where?: QueryBuilderRuleGroup<Record<string, unknown>>;
    /** 校验错误文案 */
    errorMessage?: string;
    /** 动态组件注入时使用的回调 */
    valueChangeFn?: ((value: unknown) => void) | undefined;
    /** 动态组件注入时使用的 where 回调 */
    whereChangeFn?: ((where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined) => void) | undefined;
  }>(),
  {
    fieldType: 'string',
    operator: '=',
    value: () => '',
    enumOptions: () => [],
    relationFields: () => [],
    errorMessage: '',
    valueChangeFn: undefined,
    whereChangeFn: undefined
  }
);

const emit = defineEmits<{
  /** 值变更 */
  valueChange: [value: unknown];
  /** 子查询条件变更 */
  whereChange: [where: QueryBuilderRuleGroup<Record<string, unknown>> | undefined];
}>();

/** 内部状态 —— 替代原先的可变类属性 */
const currentValue = ref<unknown>('');
const rangeMin = ref<unknown>(null);
const rangeMax = ref<unknown>(null);
const arrayInputValue = ref('');
const currentDateStr = ref('');
const dateRangeStart = ref('');
const dateRangeEnd = ref('');

const inputType = computed(() => coreGetInputType(props.fieldType, props.operator, props.enumOptions));
const enumSelectOptions = computed(() => props.enumOptions.map(opt => ({ value: String(opt), label: String(opt) })));
const hasError = computed(() => !!props.errorMessage);

/** UUID 格式校验错误（基于 currentValue 派生，inputType 不是 uuid 时自动为空） */
const uuidError = computed(() => {
  if (inputType.value !== 'uuid') return '';
  const val = String(currentValue.value ?? '').trim();
  return val && !UUID_RE.test(val) ? '请输入合法的 UUID 格式' : '';
});

/** 通用值变更（string / boolean…） */
const onValueChange = (value: unknown): void => {
  currentValue.value = value;
  emit('valueChange', value);
  props.valueChangeFn?.(value);
};

/** UUID 值变更（带格式校验） */
const onUuidChange = (value: string): void => {
  currentValue.value = value;
  const trimmed = value.trim();
  emit('valueChange', trimmed.toLowerCase() || '');
  props.valueChangeFn?.(trimmed.toLowerCase() || '');
};

/** 数字输入变更 */
const onNumberInputChange = (value: string): void => {
  const num = value === '' ? null : Number(value);
  currentValue.value = num;
  emit('valueChange', num);
  props.valueChangeFn?.(num);
};

/** 枚举多选变更 */
const onEnumArrayChange = (event: Event): void => {
  const select = event.target as HTMLSelectElement;
  const selected = Array.from(select.selectedOptions).map(o => o.value);
  currentValue.value = selected;
  emit('valueChange', selected);
  props.valueChangeFn?.(selected);
};

/** 枚举选项是否选中 */
const isEnumSelected = (opt: unknown): boolean => {
  const val = currentValue.value;
  return Array.isArray(val) && val.includes(opt);
};

/** 枚举值选中（来自 PopoverSelect） */
const onEnumSelect = (value: string): void => {
  currentValue.value = value;
  emit('valueChange', value);
  props.valueChangeFn?.(value);
};

/** 原生日期输入变更 */
const onNativeDateChange = (value: string): void => {
  currentDateStr.value = value;
  emit('valueChange', value || '');
  props.valueChangeFn?.(value || '');
};

/** 日期范围起始变更 */
const onDateRangeStartChange = (value: string): void => {
  dateRangeStart.value = value;
  onDateRangePartChange();
};

/** 日期范围结束变更 */
const onDateRangeEndChange = (value: string): void => {
  dateRangeEnd.value = value;
  onDateRangePartChange();
};

const onDateRangePartChange = (): void => {
  const start = dateRangeStart.value;
  const end = dateRangeEnd.value;
  if (start && end) {
    emit('valueChange', [start, end]);
    props.valueChangeFn?.([start, end]);
  } else {
    emit('valueChange', []);
    props.valueChangeFn?.([]);
  }
};

/** 范围最小值变更 */
const onRangeMinChange = (value: string): void => {
  rangeMin.value = value === '' ? null : Number(value);
  onRangeChange();
};

/** 范围最大值变更 */
const onRangeMaxChange = (value: string): void => {
  rangeMax.value = value === '' ? null : Number(value);
  onRangeChange();
};

const onRangeChange = (): void => {
  const min = rangeMin.value;
  const max = rangeMax.value;
  if (min != null && max != null) {
    emit('valueChange', [min, max]);
    props.valueChangeFn?.([min, max]);
  } else {
    emit('valueChange', []);
    props.valueChangeFn?.([]);
  }
};

/** 数组输入值变更（逗号分隔字符串） */
const onArrayInputChange = (value: string): void => {
  arrayInputValue.value = value;
  const result = parseCommaSeparatedInput(value, props.fieldType);
  emit('valueChange', result);
  props.valueChangeFn?.(result);
};

const handleWhereChange = (where: { combinator: 'and' | 'or'; rules: unknown[] } | undefined): void => {
  const typedWhere = where as QueryBuilderRuleGroup<Record<string, unknown>> | undefined;
  emit('whereChange', typedWhere);
  props.whereChangeFn?.(typedWhere);
};

// ── 输入形态初始化与切换 ──────────────────────────────────────────────

/** 按输入形态回填既有值（等价 Angular ngOnInit） */
const initFromValue = (): void => {
  const value = props.value;
  if (inputType.value === 'range' && Array.isArray(value)) {
    if (props.fieldType === 'date') {
      dateRangeStart.value = String(value[0] ?? '');
      dateRangeEnd.value = String(value[1] ?? '');
    } else {
      rangeMin.value = value[0];
      rangeMax.value = value[1];
    }
  } else if (inputType.value === 'array' && Array.isArray(value)) {
    arrayInputValue.value = value.join(', ');
  } else if (inputType.value === 'enum-array') {
    currentValue.value = Array.isArray(value) ? value : [];
  } else if (inputType.value === 'date') {
    currentDateStr.value = typeof value === 'string' ? value : '';
  } else if (inputType.value === 'uuid') {
    currentValue.value = typeof value === 'string' ? value : '';
  } else {
    currentValue.value = props.fieldType === 'number' && value === '' ? null : value;
  }
};

initFromValue();

/** 切换输入形态时重置为该形态的默认值并 emit */
let previousInputType: string | null = null;
watch(
  inputType,
  currentType => {
    if (previousInputType !== null && previousInputType !== currentType) {
      const defaultVal = coreGetDefaultValue(currentType);
      currentValue.value = defaultVal;
      emit('valueChange', defaultVal);
      props.valueChangeFn?.(defaultVal);
    }
    previousInputType = currentType;
  },
  { immediate: true }
);

defineExpose({
  uuidError,
  currentValue,
  rangeMin,
  rangeMax,
  arrayInputValue,
  currentDateStr,
  dateRangeStart,
  dateRangeEnd,
  inputType,
  enumSelectOptions,
  hasError,
  onValueChange,
  onUuidChange,
  onNumberInputChange,
  onEnumArrayChange,
  isEnumSelected,
  onEnumSelect,
  onNativeDateChange,
  onDateRangeStartChange,
  onDateRangeEndChange,
  onDateRangePartChange,
  onRangeMinChange,
  onRangeMaxChange,
  onRangeChange,
  onArrayInputChange,
  handleWhereChange
});
</script>

<template>
  <template v-if="inputType === 'none'">
    <span class="text-base-content/50 px-2 text-sm italic">无需输入值</span>
  </template>
  <template v-else-if="inputType === 'uuid'">
    <div
      :class="{ 'tooltip-top': !!uuidError || hasError, tooltip: !!uuidError || hasError }"
      :data-tip="uuidError || errorMessage || null"
    >
      <input
        class="input input-sm font-mono"
        :class="{ 'input-error': hasError || !!uuidError }"
        :value="currentValue as string"
        @input="onUuidChange(($event.target as HTMLInputElement).value)"
        placeholder="输入 UUID"
        style="min-width: 16rem"
        type="text"
      />
    </div>
  </template>
  <template v-else-if="inputType === 'subquery'">
    <div class="subquery-container w-full">
      <span
        class="text-base-content/50 px-2 text-sm italic"
        v-if="!relationFields || relationFields.length === 0"
        >存在/不存在（无子条件）</span
      >
      <SubqueryBuilder
        v-else
        :fields="relationFields"
        :initial-query="where"
        @query-change="handleWhereChange"
      />
    </div>
  </template>
  <input
    class="toggle toggle-sm"
    v-else-if="inputType === 'boolean'"
    :checked="!!currentValue"
    @change="onValueChange(($event.target as HTMLInputElement).checked)"
    type="checkbox"
  />
  <PopoverSelect
    v-else-if="inputType === 'enum'"
    :options="enumSelectOptions"
    :selected="currentValue == null ? '' : String(currentValue)"
    @select-change="onEnumSelect"
    min-width="12rem"
    placeholder="选择值"
  />
  <div
    v-else-if="inputType === 'enum-array'"
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <select
      class="select select-sm"
      :class="{ 'select-error': hasError }"
      @change="onEnumArrayChange"
      multiple
      style="min-width: 12rem; min-height: 6rem"
    >
      <option
        v-for="opt in enumOptions"
        :key="String(opt)"
        :selected="isEnumSelected(opt)"
        :value="String(opt)"
      >
        {{ String(opt) }}
      </option>
    </select>
  </div>
  <div
    class="flex items-center gap-2"
    v-else-if="inputType === 'range' && fieldType === 'date'"
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="dateRangeStart"
      @change="onDateRangeStartChange(($event.target as HTMLInputElement).value)"
      style="width: 9rem"
      type="date"
    />
    <span class="text-base-content/50">至</span>
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="dateRangeEnd"
      @change="onDateRangeEndChange(($event.target as HTMLInputElement).value)"
      style="width: 9rem"
      type="date"
    />
  </div>
  <div
    class="flex items-center gap-2"
    v-else-if="inputType === 'range'"
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="rangeMin ?? ''"
      @input="onRangeMinChange(($event.target as HTMLInputElement).value)"
      placeholder="最小值"
      style="width: 7rem"
      type="number"
    />
    <span class="text-base-content/50">至</span>
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="rangeMax ?? ''"
      @input="onRangeMaxChange(($event.target as HTMLInputElement).value)"
      placeholder="最大值"
      style="width: 7rem"
      type="number"
    />
  </div>
  <div
    v-else-if="inputType === 'number'"
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="currentValue ?? ''"
      @input="onNumberInputChange(($event.target as HTMLInputElement).value)"
      placeholder="输入数值"
      type="number"
    />
  </div>
  <div
    v-else-if="inputType === 'date'"
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="currentDateStr"
      @change="onNativeDateChange(($event.target as HTMLInputElement).value)"
      style="width: 10rem"
      type="date"
    />
  </div>
  <div
    v-else-if="inputType === 'array'"
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="arrayInputValue"
      @input="onArrayInputChange(($event.target as HTMLInputElement).value)"
      placeholder="输入多个值，用逗号分隔"
      style="width: 100%; min-width: 12rem"
      type="text"
    />
  </div>
  <div
    v-else
    :class="{ 'tooltip-top': hasError, tooltip: hasError }"
    :data-tip="errorMessage || null"
  >
    <input
      class="input input-sm"
      :class="{ 'input-error': hasError }"
      :value="currentValue ?? ''"
      @input="onValueChange(($event.target as HTMLInputElement).value)"
      placeholder="输入值"
      style="width: 100%; min-width: 12rem"
      type="text"
    />
  </div>
</template>

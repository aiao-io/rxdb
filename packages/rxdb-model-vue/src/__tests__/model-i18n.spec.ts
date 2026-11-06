import { getEntityMetadata } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';
import { provideI18n } from '@aiao/rxdb-i18n-vue';
import { buildPropertyColumn, defaultModelI18n, formatDateValue, localizeEntityMetadata } from '@aiao/rxdb-model';
import { Todo } from '@aiao/rxdb-test/entities';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed, defineComponent, h, nextTick } from 'vue';
import { useModelI18n } from '../i18n';

const date = new Date(2026, 9, 28, 13, 14, 15);
const render = (provided: boolean) => {
  let runtime: ReturnType<typeof useModelI18n>['runtime'] | undefined;
  const Consumer = defineComponent({
    setup() {
      runtime = useModelI18n().runtime;
      return () => h('span');
    }
  });
  const Provider = defineComponent({
    setup() {
      provideI18n(defaultModelI18n);
      return () => h(Consumer);
    }
  });
  const wrapper = mount(provided ? Provider : Consumer);
  if (!runtime) throw new Error('Missing model runtime');
  return { runtime, wrapper };
};
const numberValue = (runtime: ReturnType<typeof useModelI18n>['runtime']) => {
  const column = buildPropertyColumn({ field: 'amount', type: 'number', i18n: runtime });
  return (column.fieldFormat as (row: Record<string, unknown>) => string)({ amount: 1234567.89 });
};

describe('模型 Vue 的默认格式兼容', () => {
  it('无provider时保留日期时间与未分组数字', () => {
    const { runtime, wrapper } = render(false);
    try {
      expect(formatDateValue(date, runtime)).toBe(date.toLocaleString());
      expect(numberValue(runtime)).toBe('1234567.89');
    } finally {
      wrapper.unmount();
    }
  });

  it('有provider时显式启用完整日期时间与本地化数字', () => {
    const { runtime, wrapper } = render(true);
    try {
      expect(runtime.formatDate).toBeTypeOf('function');
      expect(runtime.formatNumber).toBeTypeOf('function');
      expect(formatDateValue(date, runtime)).toBe(
        new Intl.DateTimeFormat(defaultModelI18n.locale, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        }).format(date)
      );
      expect(numberValue(runtime)).toBe(new Intl.NumberFormat(defaultModelI18n.locale).format(1234567.89));
    } finally {
      wrapper.unmount();
    }
  });
});

describe('显示目录的 Vue 响应式绑定', () => {
  it('首次缺失目录后新增翻译和切语言都更新显示元数据', async () => {
    const metadata = getEntityMetadata(Todo);
    const key = `entity.${metadata.namespace}.${metadata.name}.displayName`;
    const runtime = new I18n({ locale: 'en' });
    const Consumer = defineComponent({
      setup() {
        const binding = useModelI18n();
        const label = computed(() => localizeEntityMetadata(metadata, binding.runtime).displayName);
        return () => h('span', label.value);
      }
    });
    const Provider = defineComponent({
      setup() {
        provideI18n(runtime);
        return () => h(Consumer);
      }
    });
    const wrapper = mount(Provider);
    expect(wrapper.text()).toBe(metadata.displayName);
    runtime.registerCatalog({ locale: 'en', namespace: 'rxdb-model', messages: { [key]: 'Tasks' } });
    runtime.registerCatalog({ locale: 'zh-Hans', namespace: 'rxdb-model', messages: { [key]: '任务' } });
    await nextTick();
    expect(wrapper.text()).toBe('Tasks');
    await runtime.setLocale('zh-Hans');
    await nextTick();
    expect(wrapper.text()).toBe('任务');
    expect(metadata.displayName).not.toBe('Tasks');
    wrapper.unmount();
    runtime.destroy();
  });
});

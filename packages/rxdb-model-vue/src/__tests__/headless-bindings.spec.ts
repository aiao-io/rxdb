import type { QueryBuilderControllerOptions } from '@aiao/rxdb-model/headless';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { useEntityForm } from '../entity-form/headless';
import { useQueryBuilder } from '../headless';

const fields = [{ field: 'title', displayName: '标题', type: 'string' as const }];

describe('Vue headless bindings', () => {
  it('data/entity 变化会同步到表单，字段深层变化也会同步', async () => {
    const host = defineComponent({
      props: { data: { type: Object, required: true }, fields: { type: Array, default: () => fields } },
      setup(props) {
        return { binding: useEntityForm(props as unknown as Parameters<typeof useEntityForm>[0]) };
      },
      render() {
        return h('div');
      }
    });
    const wrapper = mount(host, { props: { data: { title: 'A' }, fields } });
    const vm = wrapper.vm as unknown as { binding: ReturnType<typeof useEntityForm> };
    vm.binding.controller.setField('title', 'draft');
    await wrapper.setProps({ data: { title: 'B' } });
    expect(vm.binding.snapshot.value.data.title).toBe('B');
  });

  it('查询构建器深度监听原地修改的字段元数据', async () => {
    const state = reactive({ fields: [{ name: 'title', displayName: '标题', type: 'string' as const }] });
    const host = defineComponent({
      setup() {
        return { binding: useQueryBuilder(state as unknown as QueryBuilderControllerOptions) };
      },
      render() {
        return h('div');
      }
    });
    const wrapper = mount(host);
    const vm = wrapper.vm as unknown as { binding: ReturnType<typeof useQueryBuilder> };
    state.fields[0].displayName = '名称';
    await nextTick();
    expect(vm.binding.controller.snapshot.fields[0]?.displayName).toBe('名称');
    wrapper.unmount();
  });
});

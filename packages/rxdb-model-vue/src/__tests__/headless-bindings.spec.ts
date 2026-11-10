import type { EntityListLoadResult, QueryBuilderControllerOptions } from '@aiao/rxdb-model/headless';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { useEntityForm } from '../entity-form/headless';
import { useEntityDetail, useEntityList, useQueryBuilder, useQueryTable } from '../headless';

const fields = [{ field: 'title', displayName: '标题', type: 'string' as const }];
const record = (id: string) => ({ id, title: id, save: async () => undefined, remove: async () => undefined });

/** 同一组 props 同时驱动列表与查询表格，便于两种绑定对拍。 */
function mountLists(props: Record<string, unknown>) {
  const host = defineComponent({
    props: {
      records: { type: Array, default: undefined },
      page: { type: Number, default: undefined },
      pageSize: { type: Number, default: undefined },
      sorts: { type: Array, default: undefined },
      capabilities: { type: Object, default: undefined },
      load: { type: Function, default: undefined }
    },
    setup(hostProps) {
      return { list: useEntityList(hostProps as never), table: useQueryTable(hostProps as never) };
    },
    render() {
      return h('div');
    }
  });
  const wrapper = mount(host, { props });
  const vm = wrapper.vm as unknown as {
    list: ReturnType<typeof useEntityList>;
    table: ReturnType<typeof useQueryTable>;
  };
  return { wrapper, bindings: [vm.list, vm.table] };
}

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

  // 撤下可选的 mode 时恢复共享控制器的默认 edit，与 Angular / React 绑定一致（RV-01a1bb54b35b79d491932d4436e84437）
  it.each(['view', 'create'] as const)('表单与详情的 mode 从 %s 撤下后恢复默认 edit，草稿保留', async initialMode => {
    const host = defineComponent({
      props: {
        data: { type: Object, required: true },
        fields: { type: Array, default: () => fields },
        mode: { type: String, default: undefined }
      },
      setup(props) {
        const options = props as unknown as Parameters<typeof useEntityForm>[0];
        return { form: useEntityForm(options), detail: useEntityDetail(options) };
      },
      render() {
        return h('div');
      }
    });
    const wrapper = mount(host, { props: { data: { title: 'A' }, fields, mode: initialMode } });
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof useEntityForm>;
      detail: ReturnType<typeof useEntityDetail>;
    };
    expect(vm.form.snapshot.value.mode).toBe(initialMode);
    vm.form.controller.setField('title', 'draft');
    vm.detail.controller.form.setField('title', 'draft');

    await wrapper.setProps({ mode: undefined });

    expect(vm.form.snapshot.value.mode).toBe('edit');
    expect(vm.detail.snapshot.value.mode).toBe('edit');
    const kept = initialMode === 'view' ? 'A' : 'draft';
    expect(vm.form.snapshot.value.data.title).toBe(kept);
    expect(vm.detail.snapshot.value.form.data.title).toBe(kept);
    vm.form.controller.setField('title', 'B');
    vm.detail.controller.form.setField('title', 'B');
    expect(vm.form.snapshot.value.data.title).toBe('B');
    expect(vm.detail.snapshot.value.form.data.title).toBe('B');
    expect(vm.form.controller.submit().valid).toBe(true);
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

  it('查询表格会同步宿主能力变化', async () => {
    const host = defineComponent({
      props: {
        records: { type: Array, required: true },
        capabilities: { type: Object, default: undefined }
      },
      setup(props) {
        return { binding: useQueryTable(props as never) };
      },
      render() {
        return h('div');
      }
    });
    const wrapper = mount(host, {
      props: {
        records: [{ id: 'one', save: async () => undefined, remove: async () => undefined }],
        capabilities: { canCreate: false, canEdit: false, canDelete: false }
      }
    });
    const vm = wrapper.vm as unknown as { binding: ReturnType<typeof useQueryTable> };
    expect(vm.binding.snapshot.value.capabilities?.canCreate).toBe(false);
    await wrapper.setProps({ capabilities: { canCreate: true, canEdit: true, canDelete: false } });
    expect(vm.binding.snapshot.value.capabilities?.canEdit).toBe(true);
    wrapper.unmount();
  });

  it('列表与查询表格挂载后保留宿主记录；重传等值记录不中止进行中的查询，同批换页与记录保留新记录', async () => {
    const item = record('one');
    const { wrapper, bindings } = mountLists({ records: [item], page: 0, pageSize: 10 });
    for (const binding of bindings) expect(binding.snapshot.value.records).toEqual([item]);
    const signals: AbortSignal[] = [];
    for (const binding of bindings)
      void binding.controller.refresh(
        context =>
          new Promise<EntityListLoadResult>(() => {
            signals.push(context.signal);
          })
      );
    await wrapper.setProps({ records: [item] });
    expect(signals.map(signal => signal.aborted)).toEqual([false, false]);
    const next = record('next');
    await wrapper.setProps({ page: 1, records: [next] });
    for (const binding of bindings) expect(binding.snapshot.value).toMatchObject({ page: 1, records: [next] });
    wrapper.unmount();
  });

  it('列表与查询表格跟随分页、页大小与排序输入，刷新使用新请求上下文', async () => {
    const load = vi.fn(() => ({ records: [] }));
    const { wrapper, bindings } = mountLists({ page: 0, pageSize: 10, load });
    const request = { page: 2, pageSize: 20, sorts: [{ field: 'title', sort: 'desc' }] };
    await wrapper.setProps(request);
    for (const binding of bindings) {
      expect(binding.snapshot.value).toMatchObject(request);
      await binding.controller.refresh();
      expect(load).toHaveBeenLastCalledWith(expect.objectContaining(request));
    }
    wrapper.unmount();
  });
});

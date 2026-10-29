import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityFormData, EntityInstance, FormFieldConfig, FormMode } from '@aiao/rxdb-model';
import { provideRxDB, type RxDBInput } from '@aiao/rxdb-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, markRaw, provide, shallowRef, useAttrs, type PropType } from 'vue';
import EntityDetail from '../../entity-detail/EntityDetail.vue';
import type { EntityDetailDialogData } from '../../entity-detail/entity-detail-types';
import { ENTITY_DIALOG_CONTEXT } from '../../entity-dialog/dialog-context';
import EntityList from '../../entity-list/EntityList.vue';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

@Entity({
  name: 'AsyncDetailParent',
  namespace: 'detail-async',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'count', type: PropertyType.integer, default: 7 }
  ],
  relations: [
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'AsyncDetailChild',
      mappedProperty: 'parent'
    }
  ]
})
class AsyncDetailParent extends EntityBase {
  declare title: string;
  declare count: number;
}

@Entity({
  name: 'AsyncDetailChild',
  namespace: 'detail-async',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AsyncDetailParent',
      mappedProperty: 'children'
    }
  ]
})
class AsyncDetailChild extends EntityBase {
  declare label: string;
}

@Entity({
  name: 'AsyncDetailReplacement',
  namespace: 'detail-async',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'count', type: PropertyType.integer, default: 11 }
  ]
})
class AsyncDetailReplacement extends EntityBase {
  declare title: string;
  declare count: number;
}

type SourceKind = 'Promise' | '异步工厂' | 'Ref';

type DetailVM = InstanceType<typeof EntityDetail> & {
  draftEntity: EntityInstance | null;
  entityInstance: EntityInstance | null;
  formDataValue: EntityFormData;
  onSave(): void;
  onFormSubmitted(data: EntityFormData): void;
};

const formFields: FormFieldConfig[] = [
  { field: 'title', displayName: '标题', type: 'string', required: true },
  { field: 'count', displayName: '数量', type: 'integer' }
];

const pendingDatabase = (kind: SourceKind) => {
  const databaseRef = shallowRef<RxDB>();
  let resolve!: (database: RxDB) => void;
  const pending = new Promise<RxDB>(settle => (resolve = settle));
  const source: RxDBInput<RxDB> =
    kind === 'Ref' ? databaseRef
    : kind === '异步工厂' ? async () => pending
    : pending;
  return {
    source,
    settle(database: RxDB): void {
      if (kind === 'Ref') databaseRef.value = database;
      else resolve(database);
    }
  };
};

describe('EntityDetail 异步数据库就绪', () => {
  const mounted: Array<ReturnType<typeof mount>> = [];
  const disposeDatabases: Array<() => Promise<void>> = [];

  beforeEach(() => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        addEventListener = vi.fn<() => void>();
        removeEventListener = vi.fn<() => void>();
        postMessage = vi.fn<() => void>();
        close = vi.fn<() => void>();
      }
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn<() => void>();
        unobserve = vi.fn<() => void>();
        disconnect = vi.fn<() => void>();
      }
    );
  });

  afterEach(async () => {
    for (const wrapper of mounted.splice(0).reverse()) wrapper.unmount();
    for (const dispose of disposeDatabases.splice(0).reverse()) await dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function createDatabase(entities: EntityType[] = [AsyncDetailParent, AsyncDetailChild]) {
    const database = createInMemoryRxdb(entities);
    await database.connect(IN_MEMORY_ADAPTER_NAME);
    const destroy = vi.spyOn(database, 'destroy');
    disposeDatabases.push(async () => {
      const started = destroy.mock.results.find(result => result.type === 'return');
      if (started?.type === 'return') await started.value;
      else await database.destroy();
    });
    const adapter = (await firstValueFrom(database.localAdapter$)) as unknown as InMemoryRxDBAdapter;
    return { database, adapter };
  }

  function renderDetail(
    source: RxDBInput<RxDB>,
    overrides: Partial<EntityDetailDialogData> & { namespace?: string; name?: string } = {},
    { standalone = false }: { standalone?: boolean } = {}
  ) {
    const closed = vi.fn<(result?: unknown) => void>();
    const Host = defineComponent({
      props: {
        metadata: { type: Object as PropType<EntityDetailDialogData['metadata']>, default: undefined },
        formData: { type: Object as PropType<EntityFormData>, default: undefined },
        formMode: { type: String as PropType<FormMode>, default: undefined },
        entityId: { type: String, default: undefined },
        namespace: { type: String, default: undefined },
        name: { type: String, default: undefined }
      },
      setup(props) {
        provideRxDB(source);
        if (!standalone) provide(ENTITY_DIALOG_CONTEXT, { close: closed });
        const attrs = useAttrs();
        return () => h(EntityDetail, { ...attrs, ...props });
      }
    });
    const wrapper = mount(Host, {
      props: {
        metadata: markRaw(getEntityMetadata(AsyncDetailParent)),
        formFields,
        formData: { title: '' },
        formMode: 'create',
        ...overrides
      }
    });
    mounted.push(wrapper);
    const detail = wrapper.findComponent(EntityDetail);
    return { wrapper, detail, component: detail.vm as unknown as DetailVM, closed };
  }

  it.each<SourceKind>(['Promise', '异步工厂', 'Ref'])('%s 到货后创建草稿，保存实际落库', async kind => {
    const { database, adapter } = await createDatabase();
    const pending = pendingDatabase(kind);
    const { detail, component, closed } = renderDetail(pending.source);

    expect(component.draftEntity).toBeNull();
    expect(detail.findComponent(EntityList).exists()).toBe(false);

    pending.settle(database);
    await vi.waitFor(() => expect(component.draftEntity).not.toBeNull());
    await flushPromises();
    expect(detail.findComponent(EntityList).exists()).toBe(true);
    expect(component.formDataValue['count']).toBe(7);
    expect(adapter.tableFor(AsyncDetailParent).size).toBe(0);

    await detail.get('form input[type="text"]').setValue(`${kind} 创建`);
    await detail
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    await vi.waitFor(() => {
      expect([...adapter.tableFor(AsyncDetailParent).values()].map(row => [row['title'], row['count']])).toEqual([
        [`${kind} 创建`, 7]
      ]);
      expect(closed).toHaveBeenCalledExactlyOnceWith('saved');
    });
    expect(detail.emitted('formSubmitted')).toBeUndefined();
    expect(component.draftEntity).toBeNull();
  });

  it.each<SourceKind>(['Promise', '异步工厂', 'Ref'])('%s 到货后加载现有实体，提交实际更新', async kind => {
    const { database, adapter } = await createDatabase();
    const entity = database.entityManager.instantiate(AsyncDetailParent, { title: '原始标题', count: 19 });
    await entity.save();
    const pending = pendingDatabase(kind);
    const { detail, component, closed } = renderDetail(pending.source, {
      formMode: 'edit',
      entityId: entity.id
    });

    expect(component.entityInstance).toBeNull();
    expect(detail.findComponent(EntityList).exists()).toBe(false);

    pending.settle(database);
    await vi.waitFor(() => expect(component.formDataValue['title']).toBe('原始标题'));
    await flushPromises();
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('原始标题');

    await detail.get('form input[type="text"]').setValue(`${kind} 已更新`);
    await detail.get('form').trigger('submit');
    await vi.waitFor(() => {
      expect(adapter.tableFor(AsyncDetailParent).get(entity.id)?.['title']).toBe(`${kind} 已更新`);
      expect(closed).toHaveBeenCalledExactlyOnceWith('saved');
    });
    expect(adapter.tableFor(AsyncDetailParent).size).toBe(1);
    expect(detail.emitted('formSubmitted')).toEqual([
      [expect.objectContaining({ title: `${kind} 已更新`, count: 19 })]
    ]);
  });

  it('数据库等待期间填写的内容进入迟到草稿，不被初始数据覆盖', async () => {
    const { database, adapter } = await createDatabase();
    const pending = pendingDatabase('Ref');
    const { detail, component, closed } = renderDetail(pending.source, {
      formData: { title: '宿主初始值', count: 3 },
      fixedFormData: { count: 42 }
    });

    await detail.get('form input[type="text"]').setValue('等待时填写');
    expect(component.draftEntity).toBeNull();
    pending.settle(database);
    await vi.waitFor(() => expect(component.draftEntity).not.toBeNull());
    await flushPromises();
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('等待时填写');
    expect(component.formDataValue['count']).toBe(42);

    await detail
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    await vi.waitFor(() => {
      expect([...adapter.tableFor(AsyncDetailParent).values()].map(row => [row['title'], row['count']])).toEqual([
        ['等待时填写', 42]
      ]);
      expect(closed).toHaveBeenCalledExactlyOnceWith('saved');
    });
  });

  it.each<SourceKind>(['Promise', '异步工厂', 'Ref'])('%s 等待时显示创建初始值并阻止提前提交', async kind => {
    const { database, adapter } = await createDatabase();
    const pending = pendingDatabase(kind);
    const { detail, component, closed } = renderDetail(pending.source, {
      formData: { title: '已提供的初始值', count: 23 }
    });

    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('已提供的初始值');
    await detail.get('form input[type="text"]').setValue('等待时继续填写');
    const enabledSave = detail
      .findAll('button')
      .find(button => button.text() === '保存' && button.attributes('disabled') === undefined);
    expect(enabledSave).toBeUndefined();
    component.onSave();
    expect(closed).not.toHaveBeenCalled();
    expect(detail.emitted('formSubmitted')).toBeUndefined();
    expect(adapter.tableFor(AsyncDetailParent).size).toBe(0);

    pending.settle(database);
    await vi.waitFor(() => expect(component.draftEntity).not.toBeNull());
    await flushPromises();
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('等待时继续填写');
    expect(component.formDataValue['count']).toBe(23);
    await detail
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    await vi.waitFor(() => {
      expect([...adapter.tableFor(AsyncDetailParent).values()].map(row => [row['title'], row['count']])).toEqual([
        ['等待时继续填写', 23]
      ]);
      expect(closed).toHaveBeenCalledExactlyOnceWith('saved');
    });
  });

  it.each(['数据库', '实体查询'] as const)('%s 等待期间保留编辑输入，加载前不提交、加载后实际保存', async waiting => {
    const { database, adapter } = await createDatabase();
    const original = database.entityManager.instantiate(AsyncDetailParent, { title: '已保存的标题', count: 19 });
    await original.save();
    const pending = pendingDatabase('Ref');
    const loaded = new Subject<AsyncDetailParent>();
    if (waiting === '实体查询') {
      const repository = database.entityManager.getRepository(AsyncDetailParent);
      vi.spyOn(repository, 'get').mockReturnValue(loaded as ReturnType<typeof repository.get>);
    }
    const { detail, component, closed } = renderDetail(waiting === '数据库' ? pending.source : database, {
      formMode: 'edit',
      entityId: original.id
    });

    expect(component.entityInstance).toBeNull();
    expect(detail.find('form button[type="submit"]').exists()).toBe(false);
    await detail.get('form input[type="text"]').setValue('等待期间的编辑');
    component.onFormSubmitted({ title: '等待期间的编辑' });
    expect(detail.emitted('formSubmitted')).toBeUndefined();
    expect(closed).not.toHaveBeenCalled();
    expect(adapter.tableFor(AsyncDetailParent).get(original.id)?.['title']).toBe('已保存的标题');

    if (waiting === '数据库') pending.settle(database);
    else loaded.next(original);
    await vi.waitFor(() => expect(component.entityInstance).not.toBeNull());
    await flushPromises();
    expect(component.formDataValue['title']).toBe('等待期间的编辑');
    expect(component.formDataValue['count']).toBe(19);
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('等待期间的编辑');
    await detail.get('form').trigger('submit');
    await vi.waitFor(() => {
      expect(adapter.tableFor(AsyncDetailParent).get(original.id)?.['title']).toBe('等待期间的编辑');
      expect(closed).toHaveBeenCalledExactlyOnceWith('saved');
    });
    expect(detail.emitted('formSubmitted')).toEqual([
      [expect.objectContaining({ title: '等待期间的编辑', count: 19 })]
    ]);
    loaded.complete();
  });

  it('metadata 与路由输入同时提供时，数据库到货后用派生字段保留初始值和默认值', async () => {
    const { database, adapter } = await createDatabase();
    const pending = pendingDatabase('Ref');
    const { detail, component, closed } = renderDetail(pending.source, {
      namespace: 'detail-async',
      name: 'AsyncDetailParent',
      formFields: undefined,
      formData: { title: '派生字段中的初始值' }
    });

    pending.settle(database);
    await vi.waitFor(() => expect(component.draftEntity).not.toBeNull());
    await flushPromises();
    expect(component.formDataValue['title']).toBe('派生字段中的初始值');
    expect(component.formDataValue['count']).toBe(7);
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('派生字段中的初始值');
    expect((detail.get('form input[type="number"]').element as HTMLInputElement).value).toBe('7');
    await detail
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    await vi.waitFor(() => {
      expect([...adapter.tableFor(AsyncDetailParent).values()].map(row => [row['title'], row['count']])).toEqual([
        ['派生字段中的初始值', 7]
      ]);
      expect(closed).toHaveBeenCalledExactlyOnceWith('saved');
    });
  });

  it('等待期间卸载之后，数据库到货不补建草稿或订阅实体查询', async () => {
    const { database } = await createDatabase();
    const pending = pendingDatabase('Ref');
    const repository = database.entityManager.getRepository(AsyncDetailParent);
    const load = vi.spyOn(repository, 'get');
    const instantiate = vi.spyOn(database.entityManager, 'instantiate');
    const create = renderDetail(pending.source);
    const edit = renderDetail(pending.source, { formMode: 'edit', entityId: 'late-id' });

    create.wrapper.unmount();
    edit.wrapper.unmount();
    mounted.splice(0);
    pending.settle(database);
    await flushPromises();

    expect(instantiate).not.toHaveBeenCalledWith(AsyncDetailParent, expect.anything());
    expect(load).not.toHaveBeenCalled();
    expect(create.component.draftEntity).toBeNull();
    expect(edit.component.entityInstance).toBeNull();
  });

  it('已订阅的编辑查询在卸载时取消，迟到结果不写入已卸载组件', async () => {
    const { database } = await createDatabase();
    const entity = database.entityManager.instantiate(AsyncDetailParent, { title: '迟到结果' });
    const repository = database.entityManager.getRepository(AsyncDetailParent);
    const result = new Subject<AsyncDetailParent>();
    const unsubscribed = vi.fn<() => void>();
    const query = new Observable<AsyncDetailParent>(subscriber => {
      const subscription = result.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        unsubscribed();
      };
    });
    const load = vi.spyOn(repository, 'get').mockReturnValue(query as ReturnType<typeof repository.get>);
    const { wrapper, component } = renderDetail(database, { formMode: 'edit', entityId: entity.id });
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith(entity.id));

    wrapper.unmount();
    mounted.splice(0);
    expect(unsubscribed).toHaveBeenCalledOnce();
    result.next(entity);
    await flushPromises();
    expect(component.entityInstance).toBeNull();
    result.complete();
  });

  it('数据库引用切换时从旧库移除草稿，并只把新草稿保存到新库', async () => {
    const first = await createDatabase();
    const second = await createDatabase([AsyncDetailReplacement]);
    const databaseRef = shallowRef<RxDB | undefined>(first.database);
    const removeOldDraft = vi.spyOn(first.database.entityManager, 'removeEntityCache');
    const { wrapper, detail, component } = renderDetail(databaseRef, { formData: { title: '旧库草稿' } });
    await vi.waitFor(() => expect(component.draftEntity).not.toBeNull());
    const oldDraft = component.draftEntity!;

    databaseRef.value = undefined;
    await flushPromises();
    expect(removeOldDraft).toHaveBeenCalledWith(oldDraft);
    expect(component.draftEntity).toBeNull();
    expect(first.database.entityManager.getEntityRef(AsyncDetailParent, oldDraft.id as never)).toBeUndefined();

    await wrapper.setProps({
      metadata: markRaw(getEntityMetadata(AsyncDetailReplacement)),
      formData: { title: '新库草稿' }
    });
    databaseRef.value = second.database;
    await vi.waitFor(() => expect(component.draftEntity?.constructor).toBe(AsyncDetailReplacement));
    await flushPromises();
    await detail.get('form input[type="text"]').setValue('仅写新库');
    await detail
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    await vi.waitFor(() => {
      expect([...second.adapter.tableFor(AsyncDetailReplacement).values()].map(row => row['title'])).toEqual([
        '仅写新库'
      ]);
    });
    expect(first.adapter.tableFor(AsyncDetailParent).size).toBe(0);
  });

  it('直接换库时取消旧编辑查询，并重新装配同一实体类型的关系列表', async () => {
    const first = await createDatabase();
    const second = await createDatabase();
    const original = first.database.entityManager.instantiate(AsyncDetailParent, { title: '旧库' });
    const replacement = second.database.entityManager.instantiate(AsyncDetailParent, {
      id: original.id,
      title: '新库'
    });
    await original.save();
    await replacement.save();
    const repository = first.database.entityManager.getRepository(AsyncDetailParent);
    const query = repository.get(original.id);
    const unsubscribed = vi.fn<() => void>();
    vi.spyOn(repository, 'get').mockImplementation(
      () =>
        new Observable(subscriber => {
          const subscription = query.subscribe(subscriber);
          return () => {
            subscription.unsubscribe();
            unsubscribed();
          };
        })
    );
    const databaseRef = shallowRef(first.database);
    const { detail, component } = renderDetail(databaseRef, { formMode: 'edit', entityId: original.id });
    await vi.waitFor(() => expect(component.formDataValue['title']).toBe('旧库'));
    const oldList = detail.findComponent(EntityList).vm;

    databaseRef.value = second.database;
    await vi.waitFor(() => expect(component.formDataValue['title']).toBe('新库'));
    expect(unsubscribed).toHaveBeenCalledOnce();
    expect(detail.findComponent(EntityList).vm).not.toBe(oldList);
  });

  it.each(['等价 metadata', '临时 view 模式'] as const)('%s 不替换同库草稿或清空用户输入', async change => {
    const { database } = await createDatabase();
    const { wrapper, detail, component } = renderDetail(database, { formData: { title: '初始内容' } });
    const originalDraft = component.draftEntity;
    expect(originalDraft).not.toBeNull();
    await detail.get('form input[type="text"]').setValue('用户已填写');

    if (change === '等价 metadata') {
      const metadata = getEntityMetadata(AsyncDetailParent);
      const equivalent = Object.create(
        Object.getPrototypeOf(metadata),
        Object.getOwnPropertyDescriptors(metadata)
      ) as typeof metadata;
      await wrapper.setProps({ metadata: markRaw(equivalent) });
    } else {
      await wrapper.setProps({ formMode: 'view' });
      expect(component.draftEntity).toBe(originalDraft);
      await wrapper.setProps({ formMode: 'create' });
    }

    expect(component.draftEntity).toBe(originalDraft);
    expect(component.formDataValue['title']).toBe('用户已填写');
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('用户已填写');
  });

  it.each([
    { mode: 'create', outcome: '成功' },
    { mode: 'create', outcome: '失败' },
    { mode: 'edit', outcome: '成功' },
    { mode: 'edit', outcome: '失败' }
  ] as const)('$mode 的旧保存迟到$outcome 不影响换库后的新草稿', async ({ mode, outcome }) => {
    const first = await createDatabase();
    const second = await createDatabase([AsyncDetailReplacement]);
    const original = first.database.entityManager.instantiate(AsyncDetailParent, { title: '旧库记录' });
    if (mode === 'edit') await original.save();
    const databaseRef = shallowRef<RxDB | undefined>(first.database);
    const { wrapper, detail, component, closed } = renderDetail(databaseRef, {
      formMode: mode,
      entityId: mode === 'edit' ? original.id : undefined,
      formData: { title: '旧库记录' }
    });
    await vi.waitFor(() => {
      expect(mode === 'create' ? component.draftEntity : component.entityInstance).not.toBeNull();
    });
    const oldEntity = (mode === 'create' ? component.draftEntity : component.entityInstance)!;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const saving = new Promise<void>((complete, fail) => {
      resolve = complete;
      reject = fail;
    });
    const save = vi.spyOn(oldEntity, 'save').mockReturnValueOnce(saving);
    await detail.get('form input[type="text"]').setValue('旧库保存中的修改');
    if (mode === 'create') {
      await detail
        .findAll('button')
        .find(button => button.text() === '保存')!
        .trigger('click');
    } else {
      await detail.get('form').trigger('submit');
    }
    expect(save).toHaveBeenCalledOnce();

    databaseRef.value = undefined;
    await flushPromises();
    await wrapper.setProps({
      metadata: markRaw(getEntityMetadata(AsyncDetailReplacement)),
      formMode: 'create',
      entityId: undefined,
      formData: { title: '新库草稿' }
    });
    databaseRef.value = second.database;
    await vi.waitFor(() => expect(component.draftEntity?.constructor).toBe(AsyncDetailReplacement));
    await flushPromises();
    await detail.get('form input[type="text"]').setValue('新库独立填写');
    const newDraft = component.draftEntity;

    if (outcome === '成功') resolve();
    else reject(new Error('旧库保存失败'));
    await flushPromises();

    expect(component.draftEntity).toBe(newDraft);
    expect(component.formDataValue['title']).toBe('新库独立填写');
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('新库独立填写');
    expect(closed).not.toHaveBeenCalled();
    expect(detail.emitted('formSubmitted')).toBeUndefined();
    expect(detail.find('[data-testid="entity-detail-errors"]').exists()).toBe(false);
    expect(second.adapter.tableFor(AsyncDetailReplacement).size).toBe(0);
  });

  it.each([
    { switching: '数据库', outcome: '成功' },
    { switching: '数据库', outcome: '失败' },
    { switching: '实体 id', outcome: '成功' },
    { switching: '实体 id', outcome: '失败' }
  ] as const)('$switching A→B→A 后旧编辑保存迟到$outcome 不影响当前视图', async ({ switching, outcome }) => {
    const first = await createDatabase();
    const second = switching === '数据库' ? await createDatabase() : first;
    const original = first.database.entityManager.instantiate(AsyncDetailParent, { title: '记录 A' });
    const other = second.database.entityManager.instantiate(AsyncDetailParent, {
      ...(switching === '数据库' ? { id: original.id } : {}),
      title: '记录 B'
    });
    await original.save();
    await other.save();
    const databaseRef = shallowRef(first.database);
    const { wrapper, detail, component, closed } = renderDetail(databaseRef, {
      formMode: 'edit',
      entityId: original.id
    });
    await vi.waitFor(() => expect(component.entityInstance).not.toBeNull());
    const oldEntity = component.entityInstance!;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const saving = new Promise<void>((complete, fail) => {
      resolve = complete;
      reject = fail;
    });
    const save = vi.spyOn(oldEntity, 'save').mockReturnValueOnce(saving);
    await detail.get('form input[type="text"]').setValue('旧保存中的内容');
    await detail.get('form').trigger('submit');
    expect(save).toHaveBeenCalledOnce();

    if (switching === '数据库') databaseRef.value = second.database;
    else await wrapper.setProps({ entityId: other.id });
    await vi.waitFor(() => expect(component.formDataValue['title']).toBe('记录 B'));
    if (switching === '数据库') databaseRef.value = first.database;
    else await wrapper.setProps({ entityId: original.id });
    await vi.waitFor(() => expect(component.entityInstance).toBe(oldEntity));
    await flushPromises();
    await detail.get('form input[type="text"]').setValue('当前视图的新编辑');

    if (outcome === '成功') resolve();
    else reject(new Error('旧操作迟到的失败'));
    await flushPromises();

    expect(component.entityInstance).toBe(oldEntity);
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('当前视图的新编辑');
    expect(closed).not.toHaveBeenCalled();
    expect(detail.emitted('formSubmitted')).toBeUndefined();
    expect(detail.find('[data-testid="entity-detail-errors"]').exists()).toBe(false);
  });

  it('编辑输入后取消恢复已加载的原值，不留下待保存的编辑补丁', async () => {
    const { database, adapter } = await createDatabase();
    const original = database.entityManager.instantiate(AsyncDetailParent, { title: '原始内容', count: 19 });
    await original.save();
    const { detail, component } = renderDetail(database, { formMode: 'edit', entityId: original.id });
    await vi.waitFor(() => expect(component.formDataValue['title']).toBe('原始内容'));

    await detail.get('form input[type="text"]').setValue('需要取消的内容');
    await detail
      .findAll('form button')
      .find(button => button.text() === '取消')!
      .trigger('click');
    await flushPromises();

    expect(component.formDataValue['title']).toBe('原始内容');
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('原始内容');
    expect(adapter.tableFor(AsyncDetailParent).get(original.id)?.['title']).toBe('原始内容');
  });

  it('独立表单保存期间继续修改同一字段：保存成功后保留新输入，下一次提交落库', async () => {
    const { database, adapter } = await createDatabase();
    const original = database.entityManager.instantiate(AsyncDetailParent, { title: '保存前', count: 19 });
    await original.save();
    const { detail, component } = renderDetail(
      database,
      { formMode: 'edit', entityId: original.id },
      { standalone: true }
    );
    await vi.waitFor(() => expect(component.entityInstance).not.toBeNull());
    const entity = component.entityInstance!;
    const persist = entity.save.bind(entity);
    let release!: () => void;
    const gate = new Promise<void>(open => (release = open));
    const save = vi.spyOn(entity, 'save').mockImplementationOnce(() => gate.then(() => persist()));

    await detail.get('form input[type="text"]').setValue('A');
    await detail.get('form').trigger('submit');
    expect(save).toHaveBeenCalledOnce();
    await detail.get('form input[type="text"]').setValue('B');

    release();
    await vi.waitFor(() => expect(adapter.tableFor(AsyncDetailParent).get(original.id)?.['title']).toBe('A'));
    await flushPromises();
    expect(component.formDataValue['title']).toBe('B');
    expect((detail.get('form input[type="text"]').element as HTMLInputElement).value).toBe('B');

    await detail.get('form').trigger('submit');
    await vi.waitFor(() => expect(adapter.tableFor(AsyncDetailParent).get(original.id)?.['title']).toBe('B'));
  });

  it.each(['数据库未就绪', '实体查询未完成'] as const)('%s 时阻止保存，但取消仍可离开独立详情页', async waiting => {
    const { database } = await createDatabase();
    const original = database.entityManager.instantiate(AsyncDetailParent, { title: '已保存的标题' });
    await original.save();
    const pending = pendingDatabase('Ref');
    if (waiting === '实体查询未完成') {
      const repository = database.entityManager.getRepository(AsyncDetailParent);
      vi.spyOn(repository, 'get').mockReturnValue(
        new Subject<AsyncDetailParent>() as ReturnType<typeof repository.get>
      );
    }
    const { detail, component } = renderDetail(
      waiting === '数据库未就绪' ? pending.source : database,
      { formMode: 'edit', entityId: original.id },
      { standalone: true }
    );

    expect(component.entityInstance).toBeNull();
    expect(detail.findAll('button').find(button => button.text() === '保存')).toBeUndefined();
    await detail
      .findAll('button')
      .find(button => button.text() === '取消')!
      .trigger('click');
    expect(detail.emitted('formCancelled')).toHaveLength(1);
  });

  it('编辑的实体不存在时，错误面板给出加载失败原因，取消仍可离开独立详情页', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { database } = await createDatabase();
    const { detail, component } = renderDetail(
      database,
      { formMode: 'edit', entityId: 'missing' },
      { standalone: true }
    );
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[EntityDetail]', expect.any(Error)));
    await flushPromises();

    expect(component.entityInstance).toBeNull();
    expect(detail.find('[data-testid="entity-detail-errors"]').text()).toContain('加载失败：');
    await detail
      .findAll('button')
      .find(button => button.text() === '取消')!
      .trigger('click');
    expect(detail.emitted('formCancelled')).toHaveLength(1);
  });

  it('没有数据库 provider 的委托表单仍可提交，且不产生注入警告', async () => {
    const warning = vi.spyOn(console, 'warn');
    const wrapper = mount(EntityDetail, {
      props: {
        metadata: markRaw(getEntityMetadata(AsyncDetailReplacement)),
        formFields,
        formMode: 'create',
        delegateSave: true
      }
    });
    mounted.push(wrapper);

    await wrapper.get('form input[type="text"]').setValue('由宿主保存');
    await wrapper
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    expect(wrapper.emitted('formSubmitted')).toEqual([[{ title: '由宿主保存' }]]);
    expect(warning).not.toHaveBeenCalled();
  });

  it('委托表单的宿主初始值既不进入界面，也不进入提交：界面与提交数据一致', async () => {
    const wrapper = mount(EntityDetail, {
      props: {
        metadata: markRaw(getEntityMetadata(AsyncDetailReplacement)),
        formFields,
        formMode: 'create',
        delegateSave: true,
        formData: { title: '宿主预填标题', count: 23 }
      }
    });
    mounted.push(wrapper);

    expect((wrapper.get('form input[type="text"]').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('form input[type="number"]').element as HTMLInputElement).value).toBe('');
    await wrapper
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    expect(wrapper.find('[data-testid="entity-detail-errors"]').text()).toContain('是必填项');
    expect(wrapper.emitted('formSubmitted')).toBeUndefined();

    await wrapper.get('form input[type="text"]').setValue('由宿主保存');
    await wrapper
      .findAll('button')
      .find(button => button.text() === '保存')!
      .trigger('click');
    expect(wrapper.emitted('formSubmitted')).toEqual([[{ title: '由宿主保存' }]]);
  });
});

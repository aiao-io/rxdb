import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, type EntityType } from '@aiao/rxdb';
import {
  buildDetailTabs,
  type EntityFormData,
  type FormFieldConfig,
  type FormValidationResult
} from '@aiao/rxdb-model';
import { Todo } from '@aiao/rxdb-test/entities';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDetailComponent, type EntityDetailDialogData } from '../../entity-detail/entity-detail';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

// entity-detail 模板按 tab 类型导入 EntityListComponent（其模块图里有实体表格 → VTable），
// 引擎打桩与其余表格 spec 同口径（真实组件代码照常执行）。
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

/** 带一对多关系 + 必填字段的测试实体（tabs / 校验场景用）。 */
@Entity({
  name: 'DetailGroup',
  namespace: 'test',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'count', type: PropertyType.integer }
  ],
  relations: [
    {
      name: 'children',
      displayName: '子项',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DetailChild',
      mappedProperty: 'group'
    }
  ]
})
class DetailGroup extends EntityBase {
  declare title: string;
  declare count: number;
}

/** 一对多关系的另一端（注册进 RxDB 供关系元数据校验）。 */
@Entity({
  name: 'DetailChild',
  namespace: 'test',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'group',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DetailGroup',
      mappedProperty: 'children'
    }
  ]
})
class DetailChild extends EntityBase {
  declare label: string;
}

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * EntityDetailComponent —— **真实组件源码**。
 *
 * 覆盖 create 模式草稿实体生命周期（内存草稿 → 校验拦截 → 保存才落库）、
 * DIALOG_DATA 语境（fixedFormData 只读合并、delegateSave、creationChain 循环创建阻断）、
 * 关系 tabs（buildDetailTabs / selectTab 校验 / buildFixedQuery）、
 * formSubmitted / formCancelled 输出。数据库走 {@link createInMemoryRxdb} 的真实
 * entityManager → Repository → 内存适配器链路。
 */

describe('EntityDetailComponent（真实组件）', () => {
  let rxdb: RxDB;
  let adapter: InMemoryRxDBAdapter;
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    // 实体类的装饰器注册表是全局的：同一类只能绑定一个 RxDB 实例（resolveEntityManager 判据），
    // 因此整个文件共用一个实例，测试间经 adapter.resetData() 清业务数据。
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        #listeners = new Set<(event: MessageEvent) => void>();
        addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
          this.#listeners.add(listener);
        }
        removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
          this.#listeners.delete(listener);
        }
        postMessage(): void {
          // 单 tab 测试：不回环投递
        }
        close(): void {
          this.#listeners.clear();
        }
      }
    );
    rxdb = createInMemoryRxdb([Todo as unknown as EntityType, DetailGroup, DetailChild]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    const { firstValueFrom } = await import('rxjs');
    adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
  });

  beforeEach(() => {
    adapter.resetData();
    closeSpy = vi.fn();
  });

  const dialogData = (over: Partial<EntityDetailDialogData> = {}): EntityDetailDialogData => ({
    metadata: getEntityMetadata(DetailGroup),
    formFields: [
      { field: 'title', displayName: '标题', type: 'string', required: true },
      { field: 'count', displayName: '数量', type: 'integer' }
    ] as FormFieldConfig[],
    formData: { title: '', count: 0 },
    formMode: 'create',
    ...over
  });

  function createWithDialog(data: EntityDetailDialogData) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: RxDB, useValue: rxdb },
        { provide: DialogRef, useValue: { close: closeSpy } },
        { provide: DIALOG_DATA, useValue: data }
      ]
    });
    const fixture = TestBed.createComponent(EntityDetailComponent);
    const component = fixture.componentInstance;
    const submitted: EntityFormData[] = [];
    const cancelled: unknown[] = [];
    const validationErrors: FormValidationResult[] = [];
    component.formSubmitted.subscribe(e => submitted.push(e));
    component.formCancelled.subscribe(() => cancelled.push(null));
    component.validationErrors.subscribe(e => validationErrors.push(e));
    fixture.detectChanges();
    return { fixture, component, submitted, cancelled, validationErrors };
  }

  function createWithRouteInputs(namespace: string, name: string, entityId: string) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: RxDB, useValue: rxdb }]
    });
    const fixture = TestBed.createComponent(EntityDetailComponent);
    const component = fixture.componentInstance;
    // 路由输入必须先于首次渲染：模板 getter 链（metadataValue 等）在无 DIALOG_DATA 时依赖它们
    fixture.componentRef.setInput('namespace', namespace);
    fixture.componentRef.setInput('name', name);
    fixture.componentRef.setInput('entityId', entityId);
    fixture.detectChanges();
    return { fixture, component };
  }

  const repoOf = () => rxdb.entityManager.getRepository(DetailGroup as unknown as EntityType);
  /**
   * 查询当前落库行。
   *
   * @remarks 活查询任务可能跨用例驻留，首次发射可能是热启动的旧缓存 ——
   * 等增量合并落地后取最后一次发射。
   */
  const findAll = async (): Promise<unknown[]> => {
    const seen: unknown[][] = [];
    const subscription = repoOf()
      .find({ where: { combinator: 'and', rules: [] } } as never)
      .subscribe(rows => seen.push(rows));
    await FLUSH();
    await FLUSH();
    subscription.unsubscribe();
    return seen.at(-1) ?? [];
  };

  it('create 模式（DIALOG_DATA）立即建内存草稿，不落库，标题为 新建+显示名', async () => {
    const { component } = createWithDialog(dialogData());

    expect(component.dialogTitle()).toBe('新建DetailGroup');
    expect(component.isCreateMode()).toBe(true);
    expect(component.draftEntitySignal()).not.toBeNull();
    expect(component.draftEntitySignal()!.id).toBeTruthy();
    // 草稿尚未保存：仓库里查不到
    expect(await findAll()).toHaveLength(0);
  });

  it('校验失败阻止保存：输出 validationErrors、草稿保留、不落库', async () => {
    const { component, validationErrors } = createWithDialog(dialogData());

    component.onSave();
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].valid).toBe(false);
    expect(validationErrors[0].errors[0]).toMatchObject({ field: 'title' });
    expect(component.draftEntitySignal()).not.toBeNull();

    await FLUSH();
    expect(await findAll()).toHaveLength(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('补齐必填后保存才落库：dialogRef.close(saved)、草稿清空', async () => {
    const { component, submitted } = createWithDialog(dialogData());

    component.onFieldChanged({ field: 'title', type: 'string', value: '第一组', previousValue: '' });
    component.onSave();

    await FLUSH();
    const rows = await findAll();
    expect(rows).toHaveLength(1);
    expect((rows[0] as Record<string, unknown>)['title']).toBe('第一组');
    expect(component.draftEntitySignal()).toBeNull();
    expect(closeSpy).toHaveBeenCalledWith('saved');
    // 内部保存路径不触发 formSubmitted（那是 delegate 路径的输出）
    expect(submitted).toHaveLength(0);
  });

  it('delegateSave 不建草稿，保存时 emit formSubmitted 并关闭', () => {
    const { component, submitted } = createWithDialog(dialogData({ delegateSave: true }));

    expect(component.draftEntitySignal()).toBeNull();
    component.onFieldChanged({ field: 'title', type: 'string', value: '委托', previousValue: '' });
    component.onSave();

    // delegate 路径无草稿实体，draftFormData 只含用户输入过的字段
    expect(submitted).toEqual([{ title: '委托' }]);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('fixedFormData 合并进草稿与提交数据，且对应字段只读', () => {
    const { component } = createWithDialog(dialogData({ fixedFormData: { count: 42 } }));

    // fixed 字段强制 readonly
    expect(component.formFieldsValue.find(f => f.field === 'count')?.readonly).toBe(true);
    // fixed 值进入草稿表单数据（固定值覆盖草稿）
    expect(component.formDataValue['count']).toBe(42);
  });

  it('onFormCancelled 清理草稿缓存并 emit formCancelled', () => {
    const { component, cancelled } = createWithDialog(dialogData());
    const draftId = component.draftEntitySignal()!.id;

    expect(rxdb.entityManager.getEntityRef(DetailGroup as unknown as EntityType, draftId)).toBeTruthy();
    component.onFormCancelled();

    expect(cancelled).toHaveLength(1);
    expect(component.draftEntitySignal()).toBeNull();
    expect(rxdb.entityManager.getEntityRef(DetailGroup as unknown as EntityType, draftId)).toBeUndefined();
  });

  it('关系 tabs：基本信息 + 一对多表 tab，切 tab 前校验草稿', () => {
    const { component, validationErrors } = createWithDialog(dialogData());

    expect(component.tabs().map((t: { key: string }) => t.key)).toEqual(['basic', 'children']);

    // 草稿无效 → 切 tab 被拦截
    component.selectTab('children');
    expect(validationErrors).toHaveLength(1);
    expect(component.activeTabKey()).toBe('basic');

    // 补齐后放行
    component.onFieldChanged({ field: 'title', type: 'string', value: 'X', previousValue: '' });
    component.selectTab('children');
    expect(component.activeTabKey()).toBe('children');
    expect(component.activeRelationName()).toBe('children');
  });

  it('buildFixedQuery 覆盖 MANY_TO_MANY 与不支持的关系类型', () => {
    const { component } = createWithDialog(dialogData());
    const draftId = component.draftEntitySignal()!.id as string;

    const m2mTab = {
      key: 'tags',
      type: 'table',
      relationName: 'tags',
      relatedEntityName: 'DetailChild',
      relatedNamespace: 'test',
      relationKind: RelationKind.MANY_TO_MANY,
      mappedProperty: 'groups'
    } as Parameters<EntityDetailComponent['buildFixedQuery']>[0];
    expect(component.buildFixedQuery(m2mTab)).toEqual({
      combinator: 'and',
      rules: [{ field: 'groups.id', operator: '=', value: draftId }]
    });
    // MANY_TO_MANY 没有外键预填
    expect(component.buildFixedFormData(m2mTab)).toBeUndefined();

    const plainTab = {
      key: 'x',
      type: 'table',
      relationName: 'x',
      relatedEntityName: 'DetailChild',
      relatedNamespace: 'test',
      relationKind: RelationKind.ONE_TO_ONE
    } as Parameters<EntityDetailComponent['buildFixedQuery']>[0];
    expect(component.buildFixedQuery(plainTab)).toBeUndefined();
    expect(component.buildFixedFormData(plainTab)).toBeUndefined();
  });

  it('buildFixedQuery / buildFixedFormData 按关系类型生成固定条件', () => {
    const { component } = createWithDialog(dialogData());
    const tab = buildDetailTabs(getEntityMetadata(DetailGroup)).find(
      (t: { key: string }) => t.key === 'children'
    )! as Parameters<EntityDetailComponent['buildFixedQuery']>[0];

    const draftId = component.draftEntitySignal()!.id as string;
    expect(component.buildFixedQuery(tab)).toEqual({
      combinator: 'and',
      rules: [{ field: 'groupId', operator: '=', value: draftId }]
    });
    expect(component.buildFixedFormData(tab)).toEqual({ groupId: draftId });
  });

  it('creationChain 阻断循环创建：链上实体不再出表 tab', () => {
    const { component } = createWithDialog(dialogData({ creationChain: ['test:DetailGroup', 'test:DetailChild'] }));

    // 子实体已在链上 → 对应表 tab 被过滤
    expect(component.tabs().map((t: { key: string }) => t.key)).toEqual(['basic']);
  });

  it('edit 模式（entityId 路由输入）从仓库加载实体作为表单数据', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '已存在', count: 7 });
    await inst.save();

    const { component } = createWithRouteInputs('test', 'DetailGroup', inst.id);
    await FLUSH();

    expect(component.formModeValue).toBe('edit');
    expect(component.formDataValue['title']).toBe('已存在');
    expect(component.dialogTitle()).toBe('DetailGroup');
  });

  it('edit 模式内部保存：formSubmitted 变更落库并 emit（保存成功后）', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '旧标题' });
    await inst.save();

    const { component } = createWithRouteInputs('test', 'DetailGroup', inst.id);
    const submitted: EntityFormData[] = [];
    component.formSubmitted.subscribe(e => submitted.push(e));
    await FLUSH();

    component.onFormSubmitted({ title: '新标题', count: 0 });
    await vi.waitFor(async () => {
      expect(((await findAll())[0] as Record<string, unknown>)['title']).toBe('新标题');
    });
    expect(submitted).toEqual([{ title: '新标题', count: 0 }]);
  });

  it('edit 对话框模式（DIALOG_DATA entityId）从仓库加载实例作为表单数据', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '弹窗编辑', count: 3 });
    await inst.save();

    const { component } = createWithDialog(dialogData({ formMode: 'edit', entityId: inst.id }));
    await FLUSH();

    expect(component.formModeValue).toBe('edit');
    expect(component.formDataValue['title']).toBe('弹窗编辑');
    expect(component.formDataValue['count']).toBe(3);
  });

  it('edit 对话框模式内部保存：变更落库 + dialogRef.close(saved) + 成功后 emit formSubmitted', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '待编辑', count: 1 });
    await inst.save();

    const { component, submitted } = createWithDialog(dialogData({ formMode: 'edit', entityId: inst.id }));
    await FLUSH();

    component.onFormSubmitted({ title: '已编辑', count: 2 });
    await vi.waitFor(async () => {
      expect(((await findAll())[0] as Record<string, unknown>)['title']).toBe('已编辑');
    });
    expect(closeSpy).toHaveBeenCalledWith('saved');
    expect(submitted).toEqual([{ title: '已编辑', count: 2 }]);
  });

  it('edit 模式无实例（无 entityId）时 formSubmitted 直接透传，不落库', async () => {
    const { component, submitted } = createWithDialog(dialogData({ formMode: 'edit' }));

    component.onFormSubmitted({ title: '纯数据', count: 0 });
    await FLUSH();

    expect(submitted).toEqual([{ title: '纯数据', count: 0 }]);
    expect(await findAll()).toHaveLength(0);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('editChain 从 DIALOG_DATA 透传（关系 tab 列表防环用）', () => {
    const { component } = createWithDialog(dialogData({ editChain: ['group-1'] }));

    expect(component.editChain()).toEqual(['group-1']);
  });
});

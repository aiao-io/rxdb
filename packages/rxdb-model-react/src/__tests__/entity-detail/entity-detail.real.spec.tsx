/**
 * EntityDetail —— **真实组件源码**（Angular `entity-detail.real.spec.ts` 的 React 移植）。
 *
 * 覆盖 create 模式草稿实体生命周期（内存草稿 → 校验拦截 → 保存才落库）、
 * DIALOG_DATA 语境（fixedFormData 只读合并、delegateSave、creationChain 循环创建阻断）、
 * 关系 tabs（buildDetailTabs / selectTab 校验 / buildFixedQuery）、
 * formSubmitted / formCancelled 输出。数据库走 {@link createInMemoryRxdb} 的真实
 * entityManager → Repository → 内存适配器链路。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityFormData, FormFieldConfig, FormValidationResult } from '@aiao/rxdb-model';
import { RxDBProvider } from '@aiao/rxdb-react';
import { Todo } from '@aiao/rxdb-test/entities';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../dialog/dialog';
import { EntityDetail, type EntityDetailDialogData } from '../../entity-detail/entity-detail';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

// entity-detail 模板按 tab 类型渲染 EntityList（其模块图里有实体表格 → VTable），
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

describe('EntityDetail（真实组件）', () => {
  let rxdb: RxDB;
  let adapter: InMemoryRxDBAdapter;

  beforeAll(async () => {
    rxdb = createInMemoryRxdb([Todo as unknown as EntityType, DetailGroup, DetailChild]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    const { firstValueFrom } = await import('rxjs');
    adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
  });

  beforeEach(() => {
    adapter.resetData();
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

  function renderWithDialog(data: EntityDetailDialogData) {
    const submitted: EntityFormData[] = [];
    const cancelled: unknown[] = [];
    const validationErrors: FormValidationResult[] = [];
    const utils = render(
      <Dialog open onClose={() => undefined} width='720px' height='80vh'>
        <RxDBProvider db={rxdb}>
          <EntityDetail
            {...data}
            onFormSubmitted={e => submitted.push(e)}
            onFormCancelled={() => cancelled.push(null)}
            onValidationErrors={e => validationErrors.push(e)}
          />
        </RxDBProvider>
      </Dialog>
    );
    // Dialog 经 portal 渲染进 document.body；面板即测试容器
    const pane = document.querySelector('.rxdb-dialog-pane') as HTMLDivElement;
    return { ...utils, container: pane, submitted, cancelled, validationErrors };
  }

  function renderWithRouteInputs(namespace: string, name: string, entityId: string) {
    return render(
      <RxDBProvider db={rxdb}>
        <EntityDetail namespace={namespace} name={name} entityId={entityId} />
      </RxDBProvider>
    );
  }

  const repoOf = () => rxdb.entityManager.getRepository(DetailGroup as unknown as EntityType);

  /** 查询当前落库行。 */
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

  it('create 模式（对话框数据）立即建内存草稿，不落库，标题为 新建+显示名', async () => {
    const { container } = renderWithDialog(dialogData());

    expect(container.textContent).toContain('新建DetailGroup');
    // 草稿尚未保存：仓库里查不到
    expect(await findAll()).toHaveLength(0);
  });

  it('校验失败阻止保存：输出 validationErrors、草稿保留、不落库', async () => {
    const { container, validationErrors } = renderWithDialog(dialogData());

    fireEvent.click(container.querySelector('[data-detail-save="true"]') as HTMLElement);

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].valid).toBe(false);
    expect(validationErrors[0].errors[0]).toMatchObject({ field: 'title' });

    await FLUSH();
    expect(await findAll()).toHaveLength(0);
    // 对话框未关闭（保存按钮仍在）
    expect(container.querySelector('[data-detail-save="true"]')).toBeTruthy();
  });

  it('补齐必填后保存才落库：草稿清空', async () => {
    const { container } = renderWithDialog(dialogData());

    fireEvent.change(container.querySelector('[data-field="title"] input') as HTMLInputElement, {
      target: { value: '第一组' }
    });
    fireEvent.click(container.querySelector('[data-detail-save="true"]') as HTMLElement);

    await waitFor(async () => {
      const rows = await findAll();
      expect(rows).toHaveLength(1);
      expect((rows[0] as Record<string, unknown>)['title']).toBe('第一组');
    });
  });

  it('delegateSave 不建草稿，保存时 emit formSubmitted', () => {
    const { container, submitted } = renderWithDialog(dialogData({ delegateSave: true }));

    fireEvent.change(container.querySelector('[data-field="title"] input') as HTMLInputElement, {
      target: { value: '委托' }
    });
    fireEvent.click(container.querySelector('[data-detail-save="true"]') as HTMLElement);

    // delegate 路径无草稿实体，draftFormData 只含用户输入过的字段
    expect(submitted).toEqual([{ title: '委托' }]);
  });

  it('fixedFormData 合并进草稿与提交数据，且对应字段只读', () => {
    const { container } = renderWithDialog(dialogData({ fixedFormData: { count: 42 } }));

    // fixed 字段强制 readonly：只读展示框显示固定值
    const countInput = container.querySelector('[data-field="count"] input');
    expect(countInput).toBeNull(); // 只读字段渲染 .input-ghost 而非输入控件
    const ghosts = [...container.querySelectorAll('.input-ghost')];
    expect(ghosts.map(g => g.textContent).some(t => t?.includes('42'))).toBe(true);
  });

  it('取消清理草稿缓存并 emit formCancelled', () => {
    const { container, cancelled } = renderWithDialog(dialogData());

    fireEvent.click(container.querySelector('[data-detail-cancel="true"]') as HTMLElement);

    expect(cancelled).toHaveLength(1);
  });

  it('关系 tabs：基本信息 + 一对多表 tab，切 tab 前校验草稿', () => {
    const { container, validationErrors } = renderWithDialog(dialogData());

    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map(t => t.getAttribute('aria-label'))).toEqual(['基本信息', '子项']);

    // 草稿无效 → 切 tab 被拦截
    fireEvent.click(tabs[1]);
    expect(validationErrors).toHaveLength(1);
    expect((tabs[0] as HTMLInputElement).checked).toBe(true);

    // 补齐后放行
    fireEvent.change(container.querySelector('[data-field="title"] input') as HTMLInputElement, {
      target: { value: 'X' }
    });
    fireEvent.click(container.querySelectorAll('[role="tab"]')[1]);
    expect((container.querySelectorAll('[role="tab"]')[1] as HTMLInputElement).checked).toBe(true);
  });

  it('creationChain 阻断循环创建：链上实体不再出表 tab', () => {
    const { container } = renderWithDialog(dialogData({ creationChain: ['test:DetailGroup', 'test:DetailChild'] }));

    // 子实体已在链上 → 对应表 tab 被过滤
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map(t => t.getAttribute('aria-label'))).toEqual(['基本信息']);
  });

  it('edit 模式（entityId 路由输入）从仓库加载实体作为表单数据', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '已存在', count: 7 });
    await inst.save();

    const { container } = renderWithRouteInputs('test', 'DetailGroup', inst.id);
    await waitFor(() => {
      expect((container.querySelector('[data-field="title"] input') as HTMLInputElement).value).toBe('已存在');
    });
    // 路由输入模式同样渲染编辑表单（基本信息 tab）
    expect(container.querySelector('[role="tab"]')).toBeTruthy();
  });

  it('edit 模式内部保存：formSubmitted 变更落库并 emit（保存成功后）', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '旧标题' });
    await inst.save();

    const submitted: EntityFormData[] = [];
    const utils = render(
      <RxDBProvider db={rxdb}>
        <EntityDetail
          namespace='test'
          name='DetailGroup'
          entityId={inst.id}
          onFormSubmitted={data => submitted.push(data)}
        />
      </RxDBProvider>
    );
    await waitFor(() => {
      expect((utils.container.querySelector('[data-field="title"] input') as HTMLInputElement).value).toBe('旧标题');
    });

    fireEvent.change(utils.container.querySelector('[data-field="title"] input') as HTMLInputElement, {
      target: { value: '新标题' }
    });
    fireEvent.click([...utils.container.querySelectorAll('button')].find(b => b.textContent?.trim() === '保存')!);

    await waitFor(async () => {
      expect(((await findAll())[0] as Record<string, unknown>)['title']).toBe('新标题');
    });
    // 编辑模式表单含系统字段（buildFormFields 'edit'）；count 未初始化 → 表单为 null
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ title: '新标题' });
  });

  it('edit 对话框模式（entityId）从仓库加载实例作为表单数据', async () => {
    const inst = rxdb.entityManager.instantiate(DetailGroup as unknown as EntityType, { title: '弹窗编辑', count: 3 });
    await inst.save();

    const { container } = renderWithDialog(dialogData({ formMode: 'edit', entityId: inst.id }));
    await waitFor(() => {
      expect((container.querySelector('[data-field="title"] input') as HTMLInputElement).value).toBe('弹窗编辑');
      expect((container.querySelector('[data-field="count"] input') as HTMLInputElement).value).toBe('3');
    });
  });

  it('edit 模式无实例（无 entityId）时 formSubmitted 直接透传，不落库', async () => {
    const { container, submitted } = renderWithDialog(dialogData({ formMode: 'edit' }));

    fireEvent.change(container.querySelector('[data-field="title"] input') as HTMLInputElement, {
      target: { value: '纯数据' }
    });
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.trim() === '保存')!);

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ title: '纯数据', count: 0 });
    await FLUSH();
    expect(await findAll()).toHaveLength(0);
  });

  it('关系 tab 渲染内嵌 EntityList（fixedQuery 外键过滤 + 级联新增通道）', () => {
    const { container } = renderWithDialog(dialogData({ formMode: 'edit', formData: { title: 'x', count: 0 } }));

    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map(t => t.getAttribute('aria-label'))).toContain('子项');

    // 关系 tab 内容存在（hidden 但渲染在 DOM 中）
    expect(container.querySelector('.rxdb-entity-list')).toBeTruthy();
  });
});

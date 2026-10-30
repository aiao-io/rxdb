/**
 * EntityDetail —— 复用同一组件切换编辑目标（**真实组件源码**；与 Vue 端
 * `entity-detail.async.spec.ts` 同一场景矩阵）。
 *
 * 目标（数据库 / 实体类型 / id / 表单模式）一变，旧实例立即作废：新目标就绪前拦截提交（表单内部动作
 * 隐藏，只留取消），加载失败原因进错误面板，旧查询与旧保存迟到的结果都不影响当前视图。
 * create 草稿同一口径：有 Provider 但库未到时保存禁用、等待期间的输入并进到货后的草稿；没有 Provider 时
 * 照常透传；换库时旧草稿随旧库清掉、按新库补建；取消 / 换库之后旧草稿迟到的保存结果一律丢弃。
 * 数据库走 {@link createInMemoryRxdb} 的真实 entityManager → Repository → 内存适配器链路，
 * 只把需要挂起或失败的查询与落库换成手动控制的结果。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityFormData, FormFieldConfig } from '@aiao/rxdb-model';
import { RxDBProvider, type RxDBSource } from '@aiao/rxdb-react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { Activity, type JSX } from 'react';
import { BehaviorSubject, EMPTY, firstValueFrom, Subject, throwError, type Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../dialog/dialog';
import { EntityDetail, type EntityDetailProps } from '../../entity-detail/entity-detail';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

// 详情模板按 tab 类型渲染 EntityList（其模块图里有实体表格 → VTable），引擎打桩与其余表格 spec 同口径
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

@Entity({
  name: 'SwitchItem',
  namespace: 'detail-switch',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'count', type: PropertyType.integer }
  ]
})
class SwitchItem extends EntityBase {
  declare title: string;
  declare count: number;
}

/** 切换实体类型用：同名 title 字段，旧实例若被误用，写入会真实落到旧表。 */
@Entity({
  name: 'SwitchOther',
  namespace: 'detail-switch',
  properties: [{ name: 'title', type: PropertyType.string, required: true }]
})
class SwitchOther extends EntityBase {
  declare title: string;
}

/** 带一对多关系的实体：关系 tab 内嵌实体列表，观察列表随数据库就绪 / 换库装配。 */
@Entity({
  name: 'SwitchGroup',
  namespace: 'detail-switch',
  properties: [{ name: 'title', type: PropertyType.string, required: true }],
  relations: [
    {
      name: 'members',
      displayName: '成员',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SwitchMember',
      mappedProperty: 'group'
    }
  ]
})
class SwitchGroup extends EntityBase {
  declare title: string;
}

/** 一对多关系的另一端（注册进 RxDB 供关系元数据校验）。 */
@Entity({
  name: 'SwitchMember',
  namespace: 'detail-switch',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [{ name: 'group', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'SwitchGroup', mappedProperty: 'members' }]
})
class SwitchMember extends EntityBase {
  declare label: string;
}

const ITEM = SwitchItem as unknown as EntityType;
const OTHER = SwitchOther as unknown as EntityType;
const GROUP = SwitchGroup as unknown as EntityType;
const MEMBER = SwitchMember as unknown as EntityType;

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** 手动结束的保存：模拟落库耗时，期间切换目标 / 取消 / 卸载。 */
function deferredSave<T>(entity: T): { promise: Promise<T>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = () => complete(entity);
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** 手动放行的闸门：草稿落库挂在它上面，期间取消 / 换库。 */
function gate(): { promise: Promise<void>; open: () => void; fail: (error: Error) => void } {
  let open!: () => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<void>((complete, reject) => {
    open = complete;
    fail = reject;
  });
  return { promise, open, fail };
}

/** 宿主可替换的输入：Provider 的数据库（`null` = 组件树里没有 Provider）、详情 props 与外层 `<Activity>` 的显隐。 */
interface DetailHost {
  database: RxDBSource<RxDB> | null;
  props: EntityDetailProps;
  mode: 'visible' | 'hidden';
}

/** create 模式表单字段：标题必填、数量可选。 */
const ITEM_FIELDS: FormFieldConfig[] = [
  { field: 'title', displayName: '标题', type: 'string', required: true },
  { field: 'count', displayName: '数量', type: 'integer' }
];

/** create 模式的对话框数据（路由输入仍是同一实体）：草稿按 metadata 建，字段与宿主初始值随之给出。 */
const createProps = (over: EntityDetailProps = {}): EntityDetailProps => ({
  metadata: getEntityMetadata(SwitchItem),
  formFields: ITEM_FIELDS,
  formMode: 'create',
  formData: { title: '' },
  ...over
});

/** 带关系实体的 create 对话框数据：表单只有标题，关系 tab 内嵌成员列表。 */
const groupProps = (): EntityDetailProps => ({
  name: 'SwitchGroup',
  metadata: getEntityMetadata(SwitchGroup),
  formFields: [ITEM_FIELDS[0]],
  formMode: 'create',
  formData: { title: '' }
});

describe('EntityDetail 编辑目标切换（真实组件）', () => {
  const databases: RxDB[] = [];

  afterEach(async () => {
    cleanup();
    for (const database of databases.splice(0)) await database.destroy();
    vi.restoreAllMocks();
  });

  async function createDatabase() {
    const rxdb = createInMemoryRxdb([ITEM, OTHER, GROUP, MEMBER]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    databases.push(rxdb);
    const adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
    return { rxdb, adapter };
  }

  async function saved<T extends typeof SwitchItem | typeof SwitchOther | typeof SwitchGroup>(
    rxdb: RxDB,
    cls: T,
    data: Partial<InstanceType<T>>
  ): Promise<InstanceType<T>> {
    const entity = rxdb.entityManager.instantiate(cls, data);
    await entity.save();
    return entity;
  }

  /** 把指定 id 的查询换成手动控制的结果流，其余 id 照常查库。 */
  function holdLoads(rxdb: RxDB, cls: EntityType, held: Record<string, Observable<unknown>>): void {
    const repository = rxdb.entityManager.getRepository(cls);
    const load = repository.get.bind(repository);
    vi.spyOn(repository, 'get').mockImplementation(
      id => (held[String(id)] ?? load(id)) as ReturnType<typeof repository.get>
    );
  }

  /** 路由输入用法（详情路由复用同一个组件实例）+ 对话框语境，观察关闭结果。 */
  function renderDetail(database: DetailHost['database'], props: EntityDetailProps) {
    const closed = vi.fn<(result?: unknown) => void>();
    const cancelled = vi.fn<() => void>();
    const submitted: EntityFormData[] = [];
    let host: DetailHost = { database, props, mode: 'visible' };
    const element = (): JSX.Element => {
      const dialog = (
        <Dialog open onClose={closed} width='720px' height='80vh'>
          <Activity mode={host.mode}>
            <EntityDetail
              namespace='detail-switch'
              name='SwitchItem'
              {...host.props}
              onFormSubmitted={data => submitted.push(data)}
              onFormCancelled={cancelled}
            />
          </Activity>
        </Dialog>
      );
      return host.database === null ? dialog : <RxDBProvider db={host.database}>{dialog}</RxDBProvider>;
    };
    const utils = render(element());
    const rerender = (next: Partial<DetailHost>): void => {
      host = { ...host, ...next, props: { ...host.props, ...next.props } };
      utils.rerender(element());
    };
    return { closed, cancelled, submitted, rerender, unmount: utils.unmount };
  }

  const pane = (): HTMLElement => document.querySelector('.rxdb-dialog-pane') as HTMLElement;

  const titleInput = (): HTMLInputElement | null => pane().querySelector('[data-field="title"] input');

  /** 表单内部的保存按钮：编辑目标未就绪时隐藏。 */
  const formSaveButton = (): Element | null => pane().querySelector('form button[type="submit"]');

  /** tabs 下方页脚的按钮文字。 */
  const footerButtons = (): string[] =>
    [...pane().querySelectorAll('[data-detail-cancel], [data-detail-save]')].map(
      button => button.textContent?.trim() ?? ''
    );

  const errorPanel = (): string | null =>
    pane().querySelector('[data-testid="entity-detail-errors"]')?.textContent ?? null;

  /** 输入标题后回车提交：等待期间保存按钮已隐藏，回车照样触发表单提交。 */
  function typeAndSubmit(title: string): void {
    fireEvent.change(titleInput()!, { target: { value: title } });
    fireEvent.submit(pane().querySelector('form')!);
  }

  async function showing(title: string): Promise<void> {
    await waitFor(() => expect(titleInput()?.value).toBe(title));
  }

  const titleOf = (adapter: InMemoryRxDBAdapter, cls: EntityType, id: string): unknown =>
    adapter.tableFor(cls).get(id)?.['title'];

  const updatesOf = (adapter: InMemoryRxDBAdapter, id: string): number =>
    adapter.changes.filter(change => change.type === 'UPDATE' && change.entityId === id).length;

  /** 该库 SwitchItem 表里已落库的标题。 */
  const titlesOf = (adapter: InMemoryRxDBAdapter): unknown[] =>
    [...adapter.tableFor(ITEM).values()].map(row => row['title']);

  const countInput = (): HTMLInputElement | null => pane().querySelector('[data-field="count"] input');

  /** tabs 下方页脚的保存按钮（create 模式）。 */
  const footerSave = (): HTMLButtonElement => pane().querySelector('[data-detail-save="true"]') as HTMLButtonElement;

  const tabLabels = (): Array<string | null> =>
    [...pane().querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute('aria-label'));

  /** 关系 tab 内嵌的实体列表（只有一个关系 tab）。 */
  const relationList = (): Element | null => pane().querySelector('.rxdb-entity-list');

  function typeTitle(title: string): void {
    fireEvent.change(titleInput()!, { target: { value: title } });
  }

  /** 让该库下一次新建落库挂在闸门上：放行即视为写入成功（不真正落表），失败原样抛出。 */
  function holdCreate(rxdb: RxDB, saving: ReturnType<typeof gate>): void {
    vi.spyOn(rxdb.entityManager.getRepository(ITEM), 'create').mockImplementationOnce(entity =>
      saving.promise.then(() => entity)
    );
  }

  it('首次加载等待期间：表单内部动作隐藏、只留取消，回车提交既不透传也不落库', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const loadA = new Subject<SwitchItem>();
    holdLoads(rxdb, ITEM, { [a.id]: loadA });
    const detail = renderDetail(rxdb, { entityId: a.id });

    expect(formSaveButton()).toBeNull();
    expect(footerButtons()).toEqual(['取消']);
    typeAndSubmit('等待期间的输入');
    await act(flush);
    expect(detail.submitted).toEqual([]);
    expect(detail.closed).not.toHaveBeenCalled();
    expect(updatesOf(adapter, a.id)).toBe(0);

    act(() => loadA.next(a));
    await showing('记录 A');
    expect(formSaveButton()).not.toBeNull();
    expect(footerButtons()).toEqual([]);
  });

  it('A 已加载→切到 B 等待期间：旧实例立即作废、提交被拦截且 A 零写入；B 到达后只写 B', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const b = await saved(rxdb, SwitchItem, { title: '记录 B' });
    const loadB = new Subject<SwitchItem>();
    holdLoads(rxdb, ITEM, { [b.id]: loadB });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');

    detail.rerender({ props: { entityId: b.id } });
    typeAndSubmit('B 页面上的输入');
    await act(flush);
    expect(titleOf(adapter, ITEM, a.id)).toBe('记录 A');
    expect(updatesOf(adapter, a.id)).toBe(0);
    expect(detail.submitted).toEqual([]);
    expect(detail.closed).not.toHaveBeenCalled();
    expect(formSaveButton()).toBeNull();
    expect(footerButtons()).toEqual(['取消']);

    act(() => loadB.next(b));
    await showing('记录 B');
    expect(formSaveButton()).not.toBeNull();
    typeAndSubmit('B 已更新');
    await waitFor(() => expect(titleOf(adapter, ITEM, b.id)).toBe('B 已更新'));
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(titleOf(adapter, ITEM, a.id)).toBe('记录 A');
    expect(updatesOf(adapter, a.id)).toBe(0);
    expect(detail.submitted).toEqual([expect.objectContaining({ title: 'B 已更新' })]);
  });

  it('A→B→C 反序到达：C 先到、B 迟到，视图与保存只认 C，B 的查询已退订', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const b = await saved(rxdb, SwitchItem, { title: '记录 B' });
    const c = await saved(rxdb, SwitchItem, { title: '记录 C' });
    const loadB = new Subject<SwitchItem>();
    const loadC = new Subject<SwitchItem>();
    holdLoads(rxdb, ITEM, { [b.id]: loadB, [c.id]: loadC });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');

    detail.rerender({ props: { entityId: b.id } });
    detail.rerender({ props: { entityId: c.id } });
    expect(loadB.observed).toBe(false);
    act(() => loadC.next(c));
    await showing('记录 C');
    act(() => loadB.next(b));
    await act(flush);
    expect(titleInput()?.value).toBe('记录 C');

    typeAndSubmit('C 已更新');
    await waitFor(() => expect(titleOf(adapter, ITEM, c.id)).toBe('C 已更新'));
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect([a.id, b.id].map(id => updatesOf(adapter, id))).toEqual([0, 0]);
  });

  it('切换实体类型：新类型记录到达前不写旧实体，到达后只写新实体', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const other = await saved(rxdb, SwitchOther, { title: '另一类记录' });
    const loadOther = new Subject<SwitchOther>();
    holdLoads(rxdb, OTHER, { [other.id]: loadOther });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');

    detail.rerender({ props: { name: 'SwitchOther', entityId: other.id } });
    typeAndSubmit('写给新类型的输入');
    await act(flush);
    expect(titleOf(adapter, ITEM, a.id)).toBe('记录 A');
    expect(updatesOf(adapter, a.id)).toBe(0);
    expect(detail.submitted).toEqual([]);
    expect(formSaveButton()).toBeNull();

    act(() => loadOther.next(other));
    await showing('另一类记录');
    typeAndSubmit('另一类已更新');
    await waitFor(() => expect(titleOf(adapter, OTHER, other.id)).toBe('另一类已更新'));
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(updatesOf(adapter, a.id)).toBe(0);
  });

  it.each([
    { switching: '实体 id', outcome: '成功' },
    { switching: '实体 id', outcome: '失败' },
    { switching: '表单模式', outcome: '成功' },
    { switching: '表单模式', outcome: '失败' },
    { switching: '数据库', outcome: '成功' },
    { switching: '数据库', outcome: '失败' }
  ] as const)(
    '$switching A→B→A 后旧保存迟到$outcome：不关闭对话框、不发事件、不写错误面板',
    async ({ switching, outcome }) => {
      const first = await createDatabase();
      const second = await createDatabase();
      const a = await saved(first.rxdb, SwitchItem, { title: '记录 A' });
      const b =
        switching === '数据库' ?
          await saved(second.rxdb, SwitchItem, { id: a.id, title: '记录 B' })
        : await saved(first.rxdb, SwitchItem, { title: '记录 B' });
      const detail = renderDetail(first.rxdb, { entityId: a.id });
      await showing('记录 A');
      const saving = deferredSave(a);
      const save = vi.spyOn(a, 'save').mockReturnValueOnce(saving.promise);
      typeAndSubmit('旧保存中的内容');
      expect(save).toHaveBeenCalledOnce();

      if (switching === '实体 id') {
        detail.rerender({ props: { entityId: b.id } });
        await showing('记录 B');
        detail.rerender({ props: { entityId: a.id } });
      } else if (switching === '表单模式') {
        detail.rerender({ props: { formMode: 'view' } });
        await waitFor(() => expect(pane().querySelector('form')?.textContent).toContain('旧保存中的内容'));
        detail.rerender({ props: { formMode: 'edit' } });
      } else {
        detail.rerender({ database: second.rxdb });
        await showing('记录 B');
        detail.rerender({ database: first.rxdb });
      }
      await showing('旧保存中的内容');

      await act(async () => {
        if (outcome === '成功') saving.resolve();
        else saving.reject(new Error('旧保存迟到的失败'));
        await flush();
      });

      expect(detail.closed).not.toHaveBeenCalled();
      expect(detail.submitted).toEqual([]);
      expect(errorPanel()).toBeNull();
    }
  );

  it.each(['查询报错', '记录不存在'] as const)(
    '%s：错误面板给出加载失败原因，只留取消且可离开，旧记录不被写',
    async failure => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { rxdb, adapter } = await createDatabase();
      const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
      const b = await saved(rxdb, SwitchItem, { title: '记录 B' });
      holdLoads(rxdb, ITEM, { [b.id]: throwError(() => new Error('B 查询失败')) });
      const detail = renderDetail(rxdb, { entityId: a.id });
      await showing('记录 A');

      detail.rerender({ props: { entityId: failure === '查询报错' ? b.id : 'missing' } });
      await waitFor(() => expect(errorPanel()).toContain('加载失败：'));
      if (failure === '查询报错') expect(errorPanel()).toContain('加载失败：B 查询失败');
      expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
      expect(formSaveButton()).toBeNull();
      expect(footerButtons()).toEqual(['取消']);
      typeAndSubmit('加载失败后的输入');
      await act(flush);
      expect(updatesOf(adapter, a.id)).toBe(0);
      expect(detail.submitted).toEqual([]);

      fireEvent.click(pane().querySelector('[data-detail-cancel="true"]')!);
      expect(detail.cancelled).toHaveBeenCalledOnce();
      expect(detail.closed).toHaveBeenCalledExactlyOnceWith(undefined);
    }
  );

  it('B 的查询不发射就结束：保持未就绪，只留取消，提交不落库', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const b = await saved(rxdb, SwitchItem, { title: '记录 B' });
    holdLoads(rxdb, ITEM, { [b.id]: EMPTY });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');

    detail.rerender({ props: { entityId: b.id } });
    await act(flush);
    typeAndSubmit('空结果后的输入');
    await act(flush);
    expect([a.id, b.id].map(id => updatesOf(adapter, id))).toEqual([0, 0]);
    expect(detail.submitted).toEqual([]);
    expect(formSaveButton()).toBeNull();
    expect(footerButtons()).toEqual(['取消']);
    expect(errorPanel()).toBeNull();
  });

  it('换库：旧库查询立即退订、旧实例作废；新库记录到达前提交被拦截，到达后只写新库', async () => {
    const first = await createDatabase();
    const second = await createDatabase();
    const a = await saved(first.rxdb, SwitchItem, { title: '旧库记录' });
    const replacement = await saved(second.rxdb, SwitchItem, { id: a.id, title: '新库记录' });
    const loadFirst = new BehaviorSubject<SwitchItem>(a);
    const loadSecond = new Subject<SwitchItem>();
    holdLoads(first.rxdb, ITEM, { [a.id]: loadFirst });
    holdLoads(second.rxdb, ITEM, { [a.id]: loadSecond });
    const detail = renderDetail(first.rxdb, { entityId: a.id });
    await showing('旧库记录');

    detail.rerender({ database: second.rxdb });
    typeAndSubmit('换库等待期间的输入');
    await act(flush);
    expect(loadFirst.observed).toBe(false);
    expect(titleOf(first.adapter, ITEM, a.id)).toBe('旧库记录');
    expect(updatesOf(first.adapter, a.id)).toBe(0);
    expect(detail.submitted).toEqual([]);
    expect(formSaveButton()).toBeNull();

    act(() => loadSecond.next(replacement));
    await showing('新库记录');
    typeAndSubmit('只写新库');
    await waitFor(() => expect(titleOf(second.adapter, ITEM, a.id)).toBe('只写新库'));
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(titleOf(first.adapter, ITEM, a.id)).toBe('旧库记录');
    expect(updatesOf(first.adapter, a.id)).toBe(0);
  });

  it('异步 source 未就绪：带 entityId 的编辑只留取消、提交不透传；到货后加载并只写该记录', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    let settle!: (database: RxDB) => void;
    const pending = new Promise<RxDB>(resolve => (settle = resolve));
    // 路由输入要等数据库到货才解析得出实体；对话框数据通道（metadata + formFields）在等待期间就有表单
    const formFields: FormFieldConfig[] = [{ field: 'title', displayName: '标题', type: 'string', required: true }];
    const detail = renderDetail(pending, { entityId: a.id, metadata: getEntityMetadata(SwitchItem), formFields });

    expect(formSaveButton()).toBeNull();
    expect(footerButtons()).toEqual(['取消']);
    typeAndSubmit('数据库未到时的输入');
    await act(flush);
    expect(detail.submitted).toEqual([]);
    expect(detail.closed).not.toHaveBeenCalled();

    await act(async () => {
      settle(rxdb);
      await flush();
    });
    await showing('记录 A');
    typeAndSubmit('到货后的修改');
    await waitFor(() => expect(titleOf(adapter, ITEM, a.id)).toBe('到货后的修改'));
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(detail.submitted).toEqual([expect.objectContaining({ title: '到货后的修改' })]);
  });

  it.each(['成功', '失败'] as const)(
    '保存进行中卸载：迟到的保存%s不再关闭对话框、发事件或写错误面板',
    async outcome => {
      const { rxdb } = await createDatabase();
      const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
      const detail = renderDetail(rxdb, { entityId: a.id });
      await showing('记录 A');
      const saving = deferredSave(a);
      vi.spyOn(a, 'save').mockReturnValueOnce(saving.promise);
      typeAndSubmit('卸载前提交的内容');

      detail.unmount();
      if (outcome === '成功') saving.resolve();
      else saving.reject(new Error('卸载后迟到的失败'));
      await flush();

      expect(detail.closed).not.toHaveBeenCalled();
      expect(detail.submitted).toEqual([]);
    }
  );

  it('加载进行中卸载：查询随之退订，迟到结果不再回写', async () => {
    const { rxdb } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const late = new Subject<SwitchItem>();
    holdLoads(rxdb, ITEM, { [a.id]: late });
    const consoleError = vi.spyOn(console, 'error');
    const detail = renderDetail(rxdb, { entityId: a.id });
    expect(late.observed).toBe(true);

    detail.unmount();
    expect(late.observed).toBe(false);
    late.next(a);
    await flush();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('保存进行中取消：迟到的保存成功不再按已保存关闭，也不发 onFormSubmitted', async () => {
    const { rxdb } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');
    const saving = deferredSave(a);
    vi.spyOn(a, 'save').mockReturnValueOnce(saving.promise);
    typeAndSubmit('取消前提交的内容');

    fireEvent.click([...pane().querySelectorAll('form button')].find(button => button.textContent?.trim() === '取消')!);
    expect(detail.cancelled).toHaveBeenCalledOnce();
    await act(async () => {
      saving.resolve();
      await flush();
    });

    expect(detail.closed.mock.calls).toEqual([[undefined]]);
    expect(detail.submitted).toEqual([]);
  });

  it('目标未变时保存失败：原因照常进错误面板，对话框不关闭、不发事件', async () => {
    const { rxdb } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');
    vi.spyOn(a, 'save').mockRejectedValueOnce(new Error('写入被拒绝'));

    typeAndSubmit('会失败的修改');
    await waitFor(() => expect(errorPanel()).toContain('保存失败：写入被拒绝'));

    expect(detail.closed).not.toHaveBeenCalled();
    expect(detail.submitted).toEqual([]);
  });

  it('保存进行中被 <Activity> 隐藏再重显：编辑目标没变，重显后到达的保存成功照常关闭并发事件', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, { title: '记录 A' });
    const detail = renderDetail(rxdb, { entityId: a.id });
    await showing('记录 A');
    const saving = deferredSave(a);
    const persist = a.save.bind(a);
    vi.spyOn(a, 'save').mockImplementationOnce(() => saving.promise.then(() => persist()));
    typeAndSubmit('隐藏前提交的内容');

    detail.rerender({ mode: 'hidden' });
    detail.rerender({ mode: 'visible' });
    await showing('隐藏前提交的内容');
    await act(async () => {
      saving.resolve();
      await flush();
    });

    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(titleOf(adapter, ITEM, a.id)).toBe('隐藏前提交的内容');
    expect(detail.submitted).toEqual([expect.objectContaining({ title: '隐藏前提交的内容' })]);
  });

  // ── Provider 有无与数据库就绪（与 Vue 端 isCreatePending / isEditPending 同口径）──────────────

  it.each(['未决 Promise', '创建失败'] as const)(
    '有 Provider 但 source 为%s：create 显示宿主初始值，保存禁用，点击既不透传也不关闭',
    async kind => {
      const source: RxDBSource<RxDB> =
        kind === '未决 Promise' ? new Promise<RxDB>(() => undefined) : () => Promise.reject(new Error('存储不可用'));
      const detail = renderDetail(source, createProps({ formData: { title: '宿主初始值', count: 3 } }));
      await act(flush);

      expect(titleInput()?.value).toBe('宿主初始值');
      expect(countInput()?.value).toBe('3');
      typeTitle('等待时填写');
      expect(footerSave().disabled).toBe(true);
      fireEvent.click(footerSave());
      await act(flush);

      expect(detail.submitted).toEqual([]);
      expect(detail.closed).not.toHaveBeenCalled();
      expect(errorPanel()).toBeNull();
    }
  );

  it('有 Provider 但库未到：等待期间的输入并进到货后的草稿，保存落库而不透传', async () => {
    const { rxdb, adapter } = await createDatabase();
    let settle!: (database: RxDB) => void;
    const pending = new Promise<RxDB>(resolve => (settle = resolve));
    const detail = renderDetail(pending, createProps({ formData: { title: '宿主初始值', count: 3 } }));

    typeTitle('等待时填写');
    await act(async () => {
      settle(rxdb);
      await flush();
    });
    await waitFor(() => expect(footerSave().disabled).toBe(false));
    expect(titleInput()?.value).toBe('等待时填写');
    expect(countInput()?.value).toBe('3');

    fireEvent.click(footerSave());
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect([...adapter.tableFor(ITEM).values()].map(row => [row['title'], row['count']])).toEqual([['等待时填写', 3]]);
    expect(detail.submitted).toEqual([]);
  });

  it('没有 Provider：带 entityId 的编辑照常透传表单数据，表单动作可用', async () => {
    const detail = renderDetail(null, {
      entityId: 'host-owned-id',
      metadata: getEntityMetadata(SwitchItem),
      formFields: [ITEM_FIELDS[0]],
      formData: { title: '宿主数据' }
    });

    expect(titleInput()?.value).toBe('宿主数据');
    expect(formSaveButton()).not.toBeNull();
    expect(footerButtons()).toEqual([]);
    typeAndSubmit('透传的修改');
    await act(flush);

    expect(detail.submitted).toEqual([{ title: '透传的修改' }]);
    expect(detail.closed).not.toHaveBeenCalled();
  });

  it('没有 Provider：create 保存照常透传表单数据并关闭', () => {
    const detail = renderDetail(null, createProps());

    expect(footerSave().disabled).toBe(false);
    typeTitle('由宿主保存');
    fireEvent.click(footerSave());

    expect(detail.submitted).toEqual([{ title: '由宿主保存' }]);
    expect(detail.closed).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('有 Provider 但库未到：带关系的实体照常渲染表单，关系列表等数据库到货才装配', async () => {
    const { rxdb } = await createDatabase();
    let settle!: (database: RxDB) => void;
    const pending = new Promise<RxDB>(resolve => (settle = resolve));
    renderDetail(pending, groupProps());

    expect(tabLabels()).toEqual(['基本信息', '成员']);
    expect(titleInput()).not.toBeNull();
    expect(relationList()).toBeNull();
    await act(async () => {
      settle(rxdb);
      await flush();
    });

    expect(relationList()).not.toBeNull();
  });

  it('有 Provider 但库未到：切关系 tab 按界面显示的数据校验，宿主初始值有效即放行', () => {
    renderDetail(new Promise<RxDB>(() => undefined), { ...groupProps(), formData: { title: '宿主初始标题' } });

    fireEvent.click(pane().querySelectorAll('[role="tab"]')[1]);

    expect(errorPanel()).toBeNull();
    expect((pane().querySelectorAll('[role="tab"]')[1] as HTMLInputElement).checked).toBe(true);
  });

  it('没有 Provider：带关系的实体照常渲染表单、不装配关系列表，保存照常透传', () => {
    const detail = renderDetail(null, groupProps());

    expect(tabLabels()).toEqual(['基本信息', '成员']);
    expect(relationList()).toBeNull();
    typeTitle('无库分组');
    fireEvent.click(footerSave());

    expect(detail.submitted).toEqual([{ title: '无库分组' }]);
  });

  // ── create 草稿保存的迟到结果（与 Vue 端 onSave 的 isCurrent 同口径）────────────────────────

  it.each(['成功', '失败'] as const)(
    'create 保存进行中取消：迟到的保存%s不再按已保存关闭，也不写错误面板',
    async outcome => {
      const { rxdb } = await createDatabase();
      const saving = gate();
      holdCreate(rxdb, saving);
      const detail = renderDetail(rxdb, createProps());
      typeTitle('取消前提交的内容');
      fireEvent.click(footerSave());

      fireEvent.click(pane().querySelector('[data-detail-cancel="true"]')!);
      expect(detail.cancelled).toHaveBeenCalledOnce();
      await act(async () => {
        if (outcome === '成功') saving.open();
        else saving.fail(new Error('取消后迟到的失败'));
        await flush();
      });

      expect(detail.closed.mock.calls).toEqual([[undefined]]);
      expect(errorPanel()).toBeNull();
    }
  );

  it.each([
    { switching: '换库', outcome: '成功' },
    { switching: '换库', outcome: '失败' },
    { switching: '换库再换回', outcome: '成功' },
    { switching: '换库再换回', outcome: '失败' }
  ] as const)(
    'create $switching后旧草稿的保存迟到$outcome：不关闭对话框、不写错误面板、不清掉新草稿',
    async ({ switching, outcome }) => {
      const first = await createDatabase();
      const saving = gate();
      holdCreate(first.rxdb, saving);
      const detail = renderDetail(first.rxdb, createProps());
      typeTitle('旧草稿保存中的内容');
      fireEvent.click(footerSave());

      // 第二个库在首帧之后才建：此前同一实体类只登记了一个库
      const second = await createDatabase();
      detail.rerender({ database: second.rxdb });
      if (switching === '换库再换回') detail.rerender({ database: first.rxdb });
      await act(flush);
      typeTitle('新草稿上的输入');
      await act(async () => {
        if (outcome === '成功') saving.open();
        else saving.fail(new Error('旧草稿迟到的失败'));
        await flush();
      });

      expect(detail.closed).not.toHaveBeenCalled();
      expect(errorPanel()).toBeNull();
      expect(titleInput()?.value).toBe('新草稿上的输入');
      fireEvent.click(footerSave());
      await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
      expect(titlesOf((switching === '换库' ? second : first).adapter)).toEqual(['新草稿上的输入']);
    }
  );

  // ── 换库（与 Vue 端 watch(rxdb) 同口径）─────────────────────────────────────────────

  it('create 直接换库：旧草稿移出旧库缓存，输入与错误面板清空，按新库补建草稿且只落新库', async () => {
    const first = await createDatabase();
    const create = vi
      .spyOn(first.rxdb.entityManager.getRepository(ITEM), 'create')
      .mockRejectedValueOnce(new Error('旧库写入被拒'));
    const detail = renderDetail(first.rxdb, createProps({ formData: { title: '宿主初始值' } }));
    typeTitle('旧草稿上的输入');
    fireEvent.click(footerSave());
    await waitFor(() => expect(errorPanel()).toContain('保存失败：旧库写入被拒'));
    const [oldDraft] = create.mock.calls[0];
    expect(first.rxdb.entityManager.getEntityRef(ITEM, oldDraft.id as never)).toBe(oldDraft);

    // 第二个库在首帧之后才建：此前同一实体类只登记了一个库
    const second = await createDatabase();
    detail.rerender({ database: second.rxdb });
    await act(flush);

    expect(first.rxdb.entityManager.getEntityRef(ITEM, oldDraft.id as never)).toBeUndefined();
    expect(errorPanel()).toBeNull();
    expect(titleInput()?.value).toBe('宿主初始值');
    typeTitle('只写新库');
    fireEvent.click(footerSave());
    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(titlesOf(second.adapter)).toEqual(['只写新库']);
    expect(titlesOf(first.adapter)).toEqual([]);
  });

  it('create 换成未就绪的 source：等待期间保存禁用、回到宿主初始值；新库到货后补建草稿，只落新库', async () => {
    const first = await createDatabase();
    const detail = renderDetail(first.rxdb, createProps({ formData: { title: '宿主初始值' } }));
    typeTitle('旧草稿上的输入');
    let settle!: (database: RxDB) => void;
    detail.rerender({ database: new Promise<RxDB>(resolve => (settle = resolve)) });
    await act(flush);

    expect(footerSave().disabled).toBe(true);
    expect(titleInput()?.value).toBe('宿主初始值');
    const second = await createDatabase();
    await act(async () => {
      settle(second.rxdb);
      await flush();
    });
    await waitFor(() => expect(footerSave().disabled).toBe(false));
    typeTitle('只写新库');
    fireEvent.click(footerSave());

    await waitFor(() => expect(detail.closed).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(titlesOf(second.adapter)).toEqual(['只写新库']);
    expect(titlesOf(first.adapter)).toEqual([]);
  });

  it.each(['保存失败', '校验失败'] as const)('编辑中直接换库：%s的错误面板随旧库清空', async failure => {
    const first = await createDatabase();
    const second = await createDatabase();
    const a = await saved(first.rxdb, SwitchItem, { title: '旧库记录' });
    await saved(second.rxdb, SwitchItem, { id: a.id, title: '新库记录' });
    const detail = renderDetail(first.rxdb, { entityId: a.id });
    await showing('旧库记录');
    if (failure === '保存失败') vi.spyOn(a, 'save').mockRejectedValueOnce(new Error('旧库写入被拒'));
    typeAndSubmit(failure === '保存失败' ? '会失败的修改' : '');
    await waitFor(() => expect(errorPanel()).not.toBeNull());

    detail.rerender({ database: second.rxdb });
    await showing('新库记录');

    expect(errorPanel()).toBeNull();
  });

  it('直接换库：关系 tab 的列表按新库重新装配，不沿用旧库的列表实例', async () => {
    const first = await createDatabase();
    const second = await createDatabase();
    const group = await saved(first.rxdb, SwitchGroup, { title: '旧库分组' });
    await saved(second.rxdb, SwitchGroup, { id: group.id, title: '新库分组' });
    const detail = renderDetail(first.rxdb, { name: 'SwitchGroup', entityId: group.id });
    await showing('旧库分组');
    const oldList = relationList();
    expect(oldList).not.toBeNull();

    detail.rerender({ database: second.rxdb });
    await showing('新库分组');

    expect(relationList()).not.toBeNull();
    expect(relationList()).not.toBe(oldList);
  });
});

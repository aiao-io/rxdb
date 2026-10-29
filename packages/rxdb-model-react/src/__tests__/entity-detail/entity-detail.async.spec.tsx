/**
 * EntityDetail —— 复用同一组件切换编辑目标（**真实组件源码**；与 Vue 端
 * `entity-detail.async.spec.ts` 同一场景矩阵）。
 *
 * 目标（数据库 / 实体类型 / id / 表单模式）一变，旧实例立即作废：新目标就绪前拦截提交（表单内部动作
 * 隐藏，只留取消），加载失败原因进错误面板，旧查询与旧保存迟到的结果都不影响当前视图。
 * 数据库走 {@link createInMemoryRxdb} 的真实 entityManager → Repository → 内存适配器链路，
 * 只把需要挂起或失败的查询换成手动控制的结果流。
 */
import { Entity, EntityBase, PropertyType, RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityFormData } from '@aiao/rxdb-model';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
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

const ITEM = SwitchItem as unknown as EntityType;
const OTHER = SwitchOther as unknown as EntityType;

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

/** 宿主可替换的输入：Provider 的数据库与详情 props。 */
interface DetailHost {
  database: RxDB | Promise<RxDB>;
  props: EntityDetailProps;
}

describe('EntityDetail 编辑目标切换（真实组件）', () => {
  const databases: RxDB[] = [];

  afterEach(async () => {
    cleanup();
    for (const database of databases.splice(0)) await database.destroy();
    vi.restoreAllMocks();
  });

  async function createDatabase() {
    const rxdb = createInMemoryRxdb([ITEM, OTHER]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    databases.push(rxdb);
    const adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
    return { rxdb, adapter };
  }

  async function saved<T extends typeof SwitchItem | typeof SwitchOther>(
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
    let host: DetailHost = { database, props };
    const element = (): JSX.Element => (
      <RxDBProvider db={host.database}>
        <Dialog open onClose={closed} width='720px' height='80vh'>
          <EntityDetail
            namespace='detail-switch'
            name='SwitchItem'
            {...host.props}
            onFormSubmitted={data => submitted.push(data)}
            onFormCancelled={cancelled}
          />
        </Dialog>
      </RxDBProvider>
    );
    const utils = render(element());
    const rerender = (next: Partial<DetailHost>): void => {
      host = { database: next.database ?? host.database, props: { ...host.props, ...next.props } };
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
    const detail = renderDetail(pending, { entityId: a.id });

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
});

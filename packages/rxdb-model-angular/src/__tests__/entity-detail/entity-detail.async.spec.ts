import { Entity, EntityBase, PropertyType, RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityFormData } from '@aiao/rxdb-model';
import { DialogRef } from '@angular/cdk/dialog';
import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { EMPTY, firstValueFrom, Subject, throwError, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDetailComponent } from '../../entity-detail/entity-detail';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

// 模板经 EntityListComponent 引入实体表格 → VTable，引擎打桩与其余表格 spec 同口径
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

type Fixture = ComponentFixture<EntityDetailComponent>;

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

/**
 * EntityDetailComponent —— 复用同一组件切换编辑目标（真实组件源码；与 Vue 端
 * `entity-detail.async.spec.ts` 同一场景矩阵）。
 *
 * 目标（实体类型 / id / 表单模式）一变，旧实例立即作废：新目标就绪前拦截提交（表单内部动作隐藏，
 * 只留取消），加载失败原因进错误面板，旧查询与旧保存迟到的结果都不影响当前视图。
 * Angular 的数据库经 DI 注入、组件生命周期内不变，换库场景只在 React / Vue 端存在。
 * 数据库走 createInMemoryRxdb 的真实 entityManager → Repository → 内存适配器链路，
 * 只把需要挂起或失败的查询换成手动控制的结果流。
 */
describe('EntityDetailComponent 编辑目标切换（真实组件）', () => {
  const databases: RxDB[] = [];

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
    TestBed.resetTestingModule();
    for (const database of databases.splice(0)) await database.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function createDatabase() {
    const rxdb = createInMemoryRxdb([SwitchItem, SwitchOther] as unknown as EntityType[]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    databases.push(rxdb);
    const adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
    return { rxdb, adapter };
  }

  async function saved<T extends typeof SwitchItem | typeof SwitchOther>(
    rxdb: RxDB,
    cls: T,
    title: string
  ): Promise<InstanceType<T>> {
    const entity = rxdb.entityManager.instantiate(cls, { title } as Partial<InstanceType<T>>);
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
  function renderDetail(rxdb: RxDB, inputs: Record<string, unknown>) {
    const close = vi.fn<(result?: unknown) => void>();
    const handleError = vi.fn<(error: unknown) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: RxDB, useValue: rxdb },
        { provide: DialogRef, useValue: { close } },
        { provide: ErrorHandler, useValue: { handleError } }
      ]
    });
    const fixture = TestBed.createComponent(EntityDetailComponent);
    const component = fixture.componentInstance;
    const submitted: EntityFormData[] = [];
    const cancelled = vi.fn<() => void>();
    component.formSubmitted.subscribe(data => submitted.push(data));
    component.formCancelled.subscribe(cancelled);
    for (const [name, value] of Object.entries({ namespace: 'detail-switch', name: 'SwitchItem', ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return { fixture, component, close, handleError, submitted, cancelled };
  }

  async function render(fixture: Fixture): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function switchTo(fixture: Fixture, inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await render(fixture);
  }

  async function showing(fixture: Fixture, title: string): Promise<void> {
    await vi.waitFor(() => expect(fixture.componentInstance.formDataValue['title']).toBe(title));
    await render(fixture);
  }

  const host = (fixture: Fixture): HTMLElement => fixture.nativeElement as HTMLElement;

  /** 表单内部的保存按钮：编辑目标未就绪时隐藏。 */
  const formSaveButton = (fixture: Fixture): Element | null =>
    host(fixture).querySelector('form button[type="submit"]');

  /** tabs 下方页脚的按钮文字（对话框标题栏的图标按钮没有文字，不计入）。 */
  const footerButtons = (fixture: Fixture): string[] =>
    [...host(fixture).querySelectorAll('button')]
      .filter(button => !button.closest('form'))
      .map(button => button.textContent?.trim() ?? '')
      .filter(text => text !== '');

  const errorPanel = (fixture: Fixture): string | null =>
    host(fixture).querySelector('[data-testid="entity-detail-errors"]')?.textContent ?? null;

  /** 输入标题后回车提交：等待期间保存按钮已隐藏，回车照样触发表单提交。 */
  function typeAndSubmit(fixture: Fixture, title: string): void {
    const input = host(fixture).querySelector<HTMLInputElement>('form input[type="text"]')!;
    input.value = title;
    input.dispatchEvent(new Event('change'));
    host(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  const titleOf = (adapter: InMemoryRxDBAdapter, cls: EntityType, id: string): unknown =>
    adapter.tableFor(cls).get(id)?.['title'];

  const updatesOf = (adapter: InMemoryRxDBAdapter, id: string): number =>
    adapter.changes.filter(change => change.type === 'UPDATE' && change.entityId === id).length;

  it('首次加载等待期间：表单内部动作隐藏、只留取消，回车提交既不透传也不落库', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const loadA = new Subject<SwitchItem>();
    holdLoads(rxdb, SwitchItem as unknown as EntityType, { [a.id]: loadA });
    const { fixture, component, close, submitted } = renderDetail(rxdb, { entityId: a.id });
    await render(fixture);

    expect(formSaveButton(fixture)).toBeNull();
    expect(footerButtons(fixture)).toEqual(['取消']);
    typeAndSubmit(fixture, '等待期间的输入');
    component.onFormSubmitted({ title: '等待期间的输入' });
    await flush();
    expect(submitted).toEqual([]);
    expect(close).not.toHaveBeenCalled();
    expect(updatesOf(adapter, a.id)).toBe(0);

    loadA.next(a);
    await showing(fixture, '记录 A');
    expect(formSaveButton(fixture)).not.toBeNull();
    expect(footerButtons(fixture)).toEqual([]);
  });

  it('A 已加载→切到 B 等待期间：旧实例立即作废、提交被拦截且 A 零写入；B 到达后只写 B', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const b = await saved(rxdb, SwitchItem, '记录 B');
    const loadB = new Subject<SwitchItem>();
    holdLoads(rxdb, SwitchItem as unknown as EntityType, { [b.id]: loadB });
    const { fixture, component, close, submitted } = renderDetail(rxdb, { entityId: a.id });
    await showing(fixture, '记录 A');

    await switchTo(fixture, { entityId: b.id });
    typeAndSubmit(fixture, 'B 页面上的输入');
    component.onFormSubmitted({ title: 'B 页面上的输入' });
    await flush();
    expect(titleOf(adapter, SwitchItem as unknown as EntityType, a.id)).toBe('记录 A');
    expect(updatesOf(adapter, a.id)).toBe(0);
    expect(submitted).toEqual([]);
    expect(close).not.toHaveBeenCalled();
    expect(component.parentEntityForRelation()).toBeNull();
    expect(component.formDataValue['title']).toBeUndefined();
    expect(formSaveButton(fixture)).toBeNull();
    expect(footerButtons(fixture)).toEqual(['取消']);

    loadB.next(b);
    await showing(fixture, '记录 B');
    expect(formSaveButton(fixture)).not.toBeNull();
    typeAndSubmit(fixture, 'B 已更新');
    await vi.waitFor(() => expect(titleOf(adapter, SwitchItem as unknown as EntityType, b.id)).toBe('B 已更新'));
    await vi.waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(titleOf(adapter, SwitchItem as unknown as EntityType, a.id)).toBe('记录 A');
    expect(updatesOf(adapter, a.id)).toBe(0);
    expect(submitted).toEqual([expect.objectContaining({ title: 'B 已更新' })]);
  });

  it('A→B→C 反序到达：C 先到、B 迟到，视图与保存只认 C，B 的查询已退订', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const b = await saved(rxdb, SwitchItem, '记录 B');
    const c = await saved(rxdb, SwitchItem, '记录 C');
    const loadB = new Subject<SwitchItem>();
    const loadC = new Subject<SwitchItem>();
    holdLoads(rxdb, SwitchItem as unknown as EntityType, { [b.id]: loadB, [c.id]: loadC });
    const { fixture, component, close } = renderDetail(rxdb, { entityId: a.id });
    await showing(fixture, '记录 A');

    await switchTo(fixture, { entityId: b.id });
    await switchTo(fixture, { entityId: c.id });
    expect(loadB.observed).toBe(false);
    loadC.next(c);
    await showing(fixture, '记录 C');
    loadB.next(b);
    await render(fixture);
    expect(component.parentEntityForRelation()).toBe(c);
    expect(component.formDataValue['title']).toBe('记录 C');

    typeAndSubmit(fixture, 'C 已更新');
    await vi.waitFor(() => expect(titleOf(adapter, SwitchItem as unknown as EntityType, c.id)).toBe('C 已更新'));
    await vi.waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith('saved'));
    expect([a.id, b.id].map(id => updatesOf(adapter, id))).toEqual([0, 0]);
  });

  it('切换实体类型：新类型记录到达前不写旧实体，到达后只写新实体', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const other = await saved(rxdb, SwitchOther, '另一类记录');
    const loadOther = new Subject<SwitchOther>();
    holdLoads(rxdb, SwitchOther as unknown as EntityType, { [other.id]: loadOther });
    const { fixture, component, close, submitted } = renderDetail(rxdb, { entityId: a.id });
    await showing(fixture, '记录 A');

    await switchTo(fixture, { name: 'SwitchOther', entityId: other.id });
    typeAndSubmit(fixture, '写给新类型的输入');
    component.onFormSubmitted({ title: '写给新类型的输入' });
    await flush();
    expect(titleOf(adapter, SwitchItem as unknown as EntityType, a.id)).toBe('记录 A');
    expect(updatesOf(adapter, a.id)).toBe(0);
    expect(submitted).toEqual([]);
    expect(component.parentEntityForRelation()).toBeNull();
    expect(formSaveButton(fixture)).toBeNull();

    loadOther.next(other);
    await showing(fixture, '另一类记录');
    typeAndSubmit(fixture, '另一类已更新');
    await vi.waitFor(() =>
      expect(titleOf(adapter, SwitchOther as unknown as EntityType, other.id)).toBe('另一类已更新')
    );
    await vi.waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(updatesOf(adapter, a.id)).toBe(0);
  });

  it.each([
    { switching: '实体 id', outcome: '成功' },
    { switching: '实体 id', outcome: '失败' },
    { switching: '表单模式', outcome: '成功' },
    { switching: '表单模式', outcome: '失败' }
  ] as const)(
    '$switching A→B→A 后旧保存迟到$outcome：不关闭对话框、不发事件、不写错误面板',
    async ({ switching, outcome }) => {
      const { rxdb } = await createDatabase();
      const a = await saved(rxdb, SwitchItem, '记录 A');
      const b = await saved(rxdb, SwitchItem, '记录 B');
      const { fixture, component, close, submitted } = renderDetail(rxdb, { entityId: a.id });
      await showing(fixture, '记录 A');
      const saving = deferredSave(a);
      const save = vi.spyOn(a, 'save').mockReturnValueOnce(saving.promise);
      typeAndSubmit(fixture, '旧保存中的内容');
      expect(save).toHaveBeenCalledOnce();

      if (switching === '实体 id') {
        await switchTo(fixture, { entityId: b.id });
        await showing(fixture, '记录 B');
        await switchTo(fixture, { entityId: a.id });
      } else {
        await switchTo(fixture, { formMode: 'view' });
        await vi.waitFor(() => expect(component.parentEntityForRelation()).toBe(a));
        await switchTo(fixture, { formMode: 'edit' });
      }
      await vi.waitFor(() => expect(component.parentEntityForRelation()).toBe(a));
      await render(fixture);

      if (outcome === '成功') saving.resolve();
      else saving.reject(new Error('旧保存迟到的失败'));
      await flush();
      await render(fixture);

      expect(close).not.toHaveBeenCalled();
      expect(submitted).toEqual([]);
      expect(component.saveError()).toBeNull();
      expect(errorPanel(fixture)).toBeNull();
    }
  );

  it.each(['查询报错', '记录不存在'] as const)(
    '%s：错误面板给出加载失败原因，只留取消且可离开，旧记录不被写',
    async failure => {
      const { rxdb, adapter } = await createDatabase();
      const a = await saved(rxdb, SwitchItem, '记录 A');
      const b = await saved(rxdb, SwitchItem, '记录 B');
      holdLoads(rxdb, SwitchItem as unknown as EntityType, {
        [b.id]: throwError(() => new Error('B 查询失败'))
      });
      const { fixture, component, close, handleError, submitted, cancelled } = renderDetail(rxdb, {
        entityId: a.id
      });
      await showing(fixture, '记录 A');

      await switchTo(fixture, { entityId: failure === '查询报错' ? b.id : 'missing' });
      await vi.waitFor(() => expect(handleError).toHaveBeenCalledOnce());
      await render(fixture);

      expect(errorPanel(fixture)).toContain(failure === '查询报错' ? '加载失败：B 查询失败' : '加载失败：');
      expect(component.parentEntityForRelation()).toBeNull();
      expect(formSaveButton(fixture)).toBeNull();
      expect(footerButtons(fixture)).toEqual(['取消']);
      component.onFormSubmitted({ title: '加载失败后的输入' });
      await flush();
      expect(updatesOf(adapter, a.id)).toBe(0);
      expect(submitted).toEqual([]);

      [...host(fixture).querySelectorAll('button')].find(button => button.textContent?.trim() === '取消')!.click();
      expect(cancelled).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledExactlyOnceWith();
    }
  );

  it('B 的查询不发射就结束：保持未就绪，只留取消，提交不落库', async () => {
    const { rxdb, adapter } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const b = await saved(rxdb, SwitchItem, '记录 B');
    holdLoads(rxdb, SwitchItem as unknown as EntityType, { [b.id]: EMPTY });
    const { fixture, component, submitted } = renderDetail(rxdb, { entityId: a.id });
    await showing(fixture, '记录 A');

    await switchTo(fixture, { entityId: b.id });
    await flush();
    await render(fixture);
    typeAndSubmit(fixture, '空结果后的输入');
    component.onFormSubmitted({ title: '空结果后的输入' });
    await flush();
    expect([a.id, b.id].map(id => updatesOf(adapter, id))).toEqual([0, 0]);
    expect(submitted).toEqual([]);
    expect(component.parentEntityForRelation()).toBeNull();
    expect(formSaveButton(fixture)).toBeNull();
    expect(footerButtons(fixture)).toEqual(['取消']);
    expect(errorPanel(fixture)).toBeNull();
  });

  it.each(['成功', '失败'] as const)(
    '保存进行中卸载：迟到的保存%s不再关闭对话框、发事件或写错误面板',
    async outcome => {
      const { rxdb } = await createDatabase();
      const a = await saved(rxdb, SwitchItem, '记录 A');
      const { fixture, component, close, submitted } = renderDetail(rxdb, { entityId: a.id });
      await showing(fixture, '记录 A');
      const saving = deferredSave(a);
      vi.spyOn(a, 'save').mockReturnValueOnce(saving.promise);
      typeAndSubmit(fixture, '卸载前提交的内容');

      fixture.destroy();
      if (outcome === '成功') saving.resolve();
      else saving.reject(new Error('卸载后迟到的失败'));
      await flush();

      expect(close).not.toHaveBeenCalled();
      expect(submitted).toEqual([]);
      expect(component.saveError()).toBeNull();
    }
  );

  it('加载进行中卸载：查询随之退订，迟到结果不写入已卸载组件', async () => {
    const { rxdb } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const late = new Subject<SwitchItem>();
    holdLoads(rxdb, SwitchItem as unknown as EntityType, { [a.id]: late });
    const { fixture, component } = renderDetail(rxdb, { entityId: a.id });
    await render(fixture);
    expect(late.observed).toBe(true);

    fixture.destroy();
    expect(late.observed).toBe(false);
    late.next(a);
    expect(component.parentEntityForRelation()).toBeNull();
  });

  it('保存进行中取消：迟到的保存成功不再按已保存关闭，也不发 formSubmitted', async () => {
    const { rxdb } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const { fixture, close, submitted, cancelled } = renderDetail(rxdb, { entityId: a.id });
    await showing(fixture, '记录 A');
    const saving = deferredSave(a);
    vi.spyOn(a, 'save').mockReturnValueOnce(saving.promise);
    typeAndSubmit(fixture, '取消前提交的内容');

    [...host(fixture).querySelectorAll<HTMLButtonElement>('form button')]
      .find(button => button.textContent?.trim() === '取消')!
      .click();
    expect(cancelled).toHaveBeenCalledOnce();
    saving.resolve();
    await flush();

    expect(close.mock.calls).toEqual([[]]);
    expect(submitted).toEqual([]);
  });

  it('目标未变时保存失败：原因照常进错误面板，对话框不关闭、不发事件', async () => {
    const { rxdb } = await createDatabase();
    const a = await saved(rxdb, SwitchItem, '记录 A');
    const { fixture, component, close, submitted } = renderDetail(rxdb, { entityId: a.id });
    await showing(fixture, '记录 A');
    vi.spyOn(a, 'save').mockRejectedValueOnce(new Error('写入被拒绝'));

    typeAndSubmit(fixture, '会失败的修改');
    await vi.waitFor(() => expect(component.saveError()).toBe('保存失败：写入被拒绝'));
    await render(fixture);

    expect(errorPanel(fixture)).toContain('保存失败：写入被拒绝');
    expect(close).not.toHaveBeenCalled();
    expect(submitted).toEqual([]);
  });
});

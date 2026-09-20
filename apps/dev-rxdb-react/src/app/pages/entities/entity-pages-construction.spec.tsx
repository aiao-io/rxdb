import { Entity, EntityBase } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 非 public namespace 的测试实体（壳页分组用）。 */
@Entity({ name: 'ShellOther', namespace: 'other' })
class ShellOther extends EntityBase {}

const rxdbHolder = vi.hoisted(() => ({ current: { config: { entities: [] as unknown[] } } }));
/** 组件桩的记录器与桩本体：mock 工厂在导入期执行（早于模块体），共享状态只能走 hoisted。 */
const stubs = vi.hoisted(() => ({
  listProps: { props: null as Record<string, unknown> | null },
  detailProps: { props: null as Record<string, unknown> | null },
  EntityListStub: null as unknown as React.ComponentType<Record<string, unknown>>,
  EntityDetailStub: null as unknown as React.ComponentType<Record<string, unknown>>
}));

vi.mock('@aiao/rxdb-react', () => ({
  useRxDB: () => rxdbHolder.current,
  useCount: () => ({ value: 0, error: undefined, isLoading: false, isEmpty: undefined, hasValue: false })
}));

vi.mock('@aiao/rxdb-model-react', async () => {
  const React = await import('react');
  stubs.EntityListStub = (props: Record<string, unknown>) => {
    stubs.listProps.props = props;
    return React.createElement('div', { 'data-testid': 'stub-entity-list' });
  };
  stubs.EntityDetailStub = (props: Record<string, unknown>) => {
    stubs.detailProps.props = props;
    return React.createElement('div', { 'data-testid': 'stub-entity-detail' });
  };
  return { EntityList: stubs.EntityListStub, EntityDetail: stubs.EntityDetailStub };
});

import EntityDetailPage from './entity-detail-page';
import EntityListPage from './entity-list-page';
import EntityShell from './entity-shell';

const makeRxdb = (entities: unknown[] = [Todo]) => ({ config: { entities } });

describe('entity demo page construction contracts', () => {
  beforeEach(() => {
    stubs.listProps.props = null;
    stubs.detailProps.props = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entity 壳页：public 实体平铺、其余按 namespace 分组，无子路由时重定向到首个实体', async () => {
    rxdbHolder.current = makeRxdb([ShellOther, Todo]);

    render(
      <MemoryRouter initialEntries={['/entities']}>
        <Routes>
          <Route element={<EntityShell />} path='entities'>
            <Route element={<EntityListPage />} path=':namespace/:name' />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('实体类型')).toBeTruthy();
    expect(screen.getByText('ShellOther')).toBeTruthy();
    expect(screen.getByText('other')).toBeTruthy();
    expect(screen.getByText('共 2 个实体')).toBeTruthy();
    // 空子路由 → 相对导航到首个实体，列表桩按路由参数定位
    await waitFor(() => {
      expect(stubs.listProps.props).toMatchObject({ namespace: 'other', name: 'ShellOther' });
    });
  });

  it('entity 壳页：已有子路由时不重定向', async () => {
    rxdbHolder.current = makeRxdb([ShellOther, Todo]);

    render(
      <MemoryRouter initialEntries={['/entities/public/Todo']}>
        <Routes>
          <Route element={<EntityShell />} path='entities'>
            <Route element={<EntityListPage />} path=':namespace/:name' />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(stubs.listProps.props).toMatchObject({ namespace: 'public', name: 'Todo' });
    });
    expect(screen.getByText('ShellOther')).toBeTruthy();
  });

  it('entity-list 页以 namespace/name 路由参数定位实体（查看由组件内置编辑对话框承载）', async () => {
    rxdbHolder.current = makeRxdb();

    render(
      <MemoryRouter initialEntries={['/entities/public/Todo']}>
        <Routes>
          <Route element={<EntityListPage />} path='entities/:namespace/:name' />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(stubs.listProps.props).toMatchObject({ namespace: 'public', name: 'Todo' });
    });
  });

  it('entity-detail 页按 namespace/name/entityId 路由参数定位实体，保存/取消后相对导航回实体列表', async () => {
    rxdbHolder.current = makeRxdb();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={['/entities/public/Todo/abc']}>
        <Routes>
          <Route element={<div data-testid='list-probe' />} path='entities/:namespace/:name' />
          <Route element={<EntityDetailPage />} path='entities/:namespace/:name/:entityId' />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(stubs.detailProps.props).toMatchObject({ namespace: 'public', name: 'Todo', entityId: 'abc' });
    });

    const props = stubs.detailProps.props!;
    (props.onFormSubmitted as (data: unknown) => void)({ title: 'todo-1' });
    (props.onFormCancelled as () => void)();

    expect(infoSpy).toHaveBeenCalledTimes(2);
    // '../..' 相对导航落到列表页（探针路由可见）
    await waitFor(() => {
      expect(screen.getByTestId('list-probe')).toBeTruthy();
    });
  });
});

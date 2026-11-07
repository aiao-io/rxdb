import type { EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { I18nProvider } from '@aiao/rxdb-i18n-react';
import type { SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import EntityListPage from './entity-list-page';
import EntityShell from './entity-shell';
import SearchPage from './search-page';
import StartPage from './start-page';

const mocks = vi.hoisted(() => ({
  database: { config: { entities: [] as EntityType[] } },
  search: {
    query: '笔记本',
    state: 'success' as SearchState,
    error: undefined as { message: string } | undefined,
    results: [] as SearchResult[],
    hasMore: false,
    setQuery: vi.fn(),
    loadMore: vi.fn()
  }
}));

vi.mock('@aiao/rxdb-react', () => ({ useRxDB: () => mocks.database }));
vi.mock('@aiao/rxdb-plugin-search-react', () => ({ useSearch: () => mocks.search }));
vi.mock('@aiao/rxdb-admin-react', () => ({ useAdminStore: () => ({ extension: { searchPageSize: 20 } }) }));
vi.mock('../shell/workbench-shell', () => ({
  SEARCH_PAGE_SIZE_KEY: 'searchPageSize',
  workbenchShell: { preferences: {} }
}));

const runtimes: I18n[] = [];

function renderPage(page: ReactNode, path = '/') {
  const runtime = createWorkbenchI18n();
  runtimes.push(runtime);
  return {
    runtime,
    ...render(
      <I18nProvider value={runtime}>
        <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
      </I18nProvider>
    )
  };
}

describe('工作台页面国际化', () => {
  beforeEach(() => {
    mocks.database.config.entities = [...ENTITIES];
    mocks.search.state = 'success';
    mocks.search.error = undefined;
    mocks.search.results = [
      { entity: 'Asset', collection: 'asset', id: 'asset-1', rank: 0, matchedField: 'name', snippet: '研发笔记本' }
    ];
  });

  afterEach(() => {
    cleanup();
    for (const runtime of runtimes.splice(0)) runtime.destroy();
  });

  it('首页入口随语言即时更新，保持相同路由', async () => {
    const view = renderPage(<StartPage />);
    expect(view.getByRole('heading', { name: '开始使用工作台' })).toBeTruthy();
    await act(async () => view.runtime.setLocale('en'));
    expect(view.getByRole('heading', { name: 'Get started with your workbench' })).toBeTruthy();
    expect(view.getByRole('link', { name: 'Open workbench' }).getAttribute('href')).toBe('/entities');
    expect(view.getByRole('link', { name: 'Restore from backup' }).getAttribute('href')).toBe('/backup');
  });

  it('搜索界面和命中字段标签切换语言，记录内容与查询值保持原样', async () => {
    const view = renderPage(<SearchPage />);
    expect(view.getByText('资产 · 名称')).toBeTruthy();
    await act(async () => view.runtime.setLocale('en'));
    expect(view.getByRole('heading', { name: 'Full-text search' })).toBeTruthy();
    expect(view.getByText('Assets · Name')).toBeTruthy();
    expect(view.getByText('研发笔记本')).toBeTruthy();
    const input = view.getByRole('textbox', { name: 'Full-text search' }) as HTMLInputElement;
    expect(input.placeholder).toBe('Search categories, assets, and maintenance records…');
    expect(input.value).toBe('笔记本');
  });

  it('搜索失败提示随语言更新并保留原始故障原因', async () => {
    mocks.search.state = 'error';
    mocks.search.error = { message: 'database unavailable' };
    const view = renderPage(<SearchPage />);
    expect(view.getByRole('alert').textContent).toBe('搜索失败：database unavailable');
    await act(async () => view.runtime.setLocale('en'));
    expect(view.getByRole('alert').textContent).toBe('Search failed: database unavailable');
  });

  it('未知实体的失败态翻译提示，保留实际路由身份', async () => {
    const view = renderPage(
      <Routes>
        <Route path='/entities/:namespace/:name' element={<EntityListPage />} />
      </Routes>,
      '/entities/assets/Unknown'
    );
    expect(view.getByRole('alert').textContent).toContain('未找到实体 assets/Unknown');
    await act(async () => view.runtime.setLocale('en'));
    expect(view.getByRole('alert').textContent).toContain('Entity assets/Unknown was not found.');
  });

  it('没有可见实体时翻译空状态', async () => {
    mocks.database.config.entities = [];
    const view = renderPage(<EntityShell />);
    expect(view.getByRole('alert').textContent).toBe('没有可见实体');
    await act(async () => view.runtime.setLocale('en'));
    expect(view.getByRole('alert').textContent).toBe('No visible entities');
  });
});

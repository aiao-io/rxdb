// @vitest-environment node
import '@angular/compiler';
import type { EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import type { SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
import { Component, provideZonelessChangeDetection, signal, type Type, type WritableSignal } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Window } from 'happy-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { populateGlobal } from 'vitest/environments';
import { ENTITIES } from '../entities/asset-entities';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import EntityListPage from './entity-list-page';
import EntityShell from './entity-shell';
import SearchPage from './search-page';
import StartPage from './start-page';

/** 搜索组合式函数的替身：与真实返回值同形，状态由用例直接驱动。 */
interface FakeSearch {
  query: WritableSignal<string>;
  results: WritableSignal<readonly SearchResult[]>;
  state: WritableSignal<SearchState>;
  error: WritableSignal<{ message: string } | undefined>;
  hasMore: WritableSignal<boolean>;
  loadMore: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

const mocks = vi.hoisted(() => ({
  database: {
    config: { entities: [] as EntityType[] },
    connect: vi.fn<(adapter: string) => Promise<void>>()
  },
  search: undefined as unknown as FakeSearch
}));

// Angular 绑定包由 ng-packagr 构建、没有 exports / main，本应用的 vitest 配置也没有路径别名，
// 页面里的 `@aiao/*-angular` 导入只能靠 vi.mock 提供；本文件因此运行在 node 环境（SSR 转换不校验裸导入），
// DOM 由 happy-dom 在 beforeAll 里装到全局。国际化绑定取包内真实源码，语言切换走真实的 signal 订阅。
vi.mock('@aiao/rxdb-i18n-angular', () => vi.importActual('../../../../../../packages/rxdb-i18n-angular/src/index'));
vi.mock('@aiao/rxdb-angular', () => ({ useRxDB: () => mocks.database }));
vi.mock('@aiao/rxdb-plugin-search-angular', () => ({ useSearch: () => mocks.search }));
vi.mock('@aiao/rxdb-admin-angular', () => ({
  injectAdminStore: () => () => ({ extension: { searchPageSize: 20 } })
}));
vi.mock('@aiao/rxdb-model-angular', async () => {
  const { Component: component, Input: input } = await import('@angular/core');
  // eslint-disable-next-line @angular-eslint/component-selector -- 与真实组件同名的选择器，页面模板才能匹配到替身
  @component({ selector: 'rxdb-entity-list', template: '' })
  class EntityListComponent {
    @input() name = '';
    @input() namespace = '';
  }
  return { EntityListComponent };
});
vi.mock('../shell/workbench-shell', () => ({
  SEARCH_PAGE_SIZE_KEY: 'searchPageSize',
  normalizeSearchPageSize: (value: unknown) => (typeof value === 'number' ? value : 20),
  workbenchShell: { preferences: {} }
}));

const ASSET_HIT: SearchResult = {
  entity: 'Asset',
  collection: 'asset',
  id: 'asset-1',
  rank: 0,
  matchedField: 'name',
  snippet: '研发笔记本'
};

/** 路由占位页：页面里的链接与重定向目标只需要能匹配到路由。 */
@Component({ selector: 'app-route-stub', template: '<div data-testid="route-stub"></div>' })
class RouteStub {}

const startRoutes: Routes = [
  { path: '', component: StartPage },
  { path: 'entities', component: RouteStub },
  { path: 'backup', component: RouteStub }
];
const searchRoutes: Routes = [{ path: '', component: SearchPage }];
const entityListRoutes: Routes = [{ path: 'entities/:namespace/:name', component: EntityListPage }];
const entityShellRoutes: Routes = [
  { path: 'entities', component: EntityShell, children: [{ path: ':namespace/:name', component: RouteStub }] }
];

interface RenderedPage<T> {
  root: HTMLElement;
  harness: RouterTestingHarness;
  page: T;
  runtime: I18n;
}

let removeDom: () => Promise<void>;
let runtime: I18n;

/** 构造搜索替身；默认是已有一条命中的成功态，查询词为「笔记本」。 */
function createSearch(initial: { query?: string; results?: readonly SearchResult[]; state?: SearchState } = {}): FakeSearch {
  return {
    query: signal(initial.query ?? '笔记本'),
    results: signal<readonly SearchResult[]>(initial.results ?? [ASSET_HIT]),
    state: signal<SearchState>(initial.state ?? 'success'),
    error: signal<{ message: string } | undefined>(undefined),
    hasMore: signal(false),
    loadMore: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  };
}

/** 等待挂起的 Promise 回调与随后的视图刷新全部完成。 */
async function settle(harness: RouterTestingHarness): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  harness.detectChanges();
  await harness.fixture.whenStable();
}

/** 切换工作台语言，并等视图随之刷新。 */
async function switchLocale(harness: RouterTestingHarness, locale: string): Promise<void> {
  await runtime.setLocale(locale);
  await harness.fixture.whenStable();
}

/** 用真实路由与真实国际化运行时渲染页面，路由表决定页面拿到的路由参数。 */
async function renderPage<T extends object>(routes: Routes, path: string, component: Type<T>): Promise<RenderedPage<T>> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideI18n(runtime), provideRouter(routes)]
  });
  const harness = await RouterTestingHarness.create();
  const page = await harness.navigateByUrl(path, component);
  await settle(harness);
  return { root: harness.fixture.nativeElement as HTMLElement, harness, page, runtime };
}

/** 数据库连接的可控替身：连接结果由用例决定何时落定。 */
function controlConnection(): { resolve: () => void; reject: (cause: unknown) => void } {
  let resolve: () => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  mocks.database.connect.mockReturnValue(
    new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    })
  );
  return { resolve, reject };
}

/** 页面里第一个匹配元素的文本；找不到时返回 `undefined`。 */
function textOf(container: ParentNode, selector: string): string | undefined {
  return container.querySelector(selector)?.textContent ?? undefined;
}

/** 按文本找链接，用来断言入口文案随语言变化而路由保持不变。 */
function linkByText(container: ParentNode, label: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find(link => link.textContent?.trim() === label);
}

/** 搜索页的输入框。 */
function searchInput(container: ParentNode): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('[data-testid="search-input"]');
  if (!input) throw new Error('搜索输入框未渲染');
  return input;
}

/** 搜索结果里每条记录的标题行。 */
function resultLabels(container: ParentNode): string[] {
  return [...container.querySelectorAll('[data-testid="search-result"] > span:first-child')].map(
    label => label.textContent?.trim() ?? ''
  );
}

beforeAll(async () => {
  const window = new Window({ url: 'http://localhost:3000', settings: { disableErrorCapturing: true } });
  const { keys, originals } = populateGlobal(globalThis, window, { bindFunctions: true });
  removeDom = async () => {
    await window.happyDOM.abort();
    window.close();
    for (const key of keys) Reflect.deleteProperty(globalThis, key);
    for (const [key, value] of originals) Reflect.set(globalThis, key, value);
  };
  const testBed = getTestBed();
  if (!testBed.platform)
    testBed.initTestEnvironment([BrowserTestingModule], platformBrowserTesting(), {
      teardown: { destroyAfterEach: true }
    });
});

afterAll(async () => removeDom());

beforeEach(() => {
  runtime = createWorkbenchI18n();
  mocks.database.config.entities = [...ENTITIES];
  mocks.database.connect.mockReset();
  mocks.search = createSearch();
});

afterEach(() => {
  TestBed.resetTestingModule();
  runtime.destroy();
});

describe('工作台页面国际化', () => {
  it('首页入口随语言即时更新，保持相同路由', async () => {
    const view = await renderPage(startRoutes, '/', StartPage);
    expect(textOf(view.root, 'h2')).toBe('开始使用工作台');
    expect(linkByText(view.root, '打开工作台')?.getAttribute('href')).toBe('/entities');
    expect(linkByText(view.root, '从备份恢复')?.getAttribute('href')).toBe('/backup');

    await switchLocale(view.harness, 'en');
    expect(textOf(view.root, 'h2')).toBe('Get started with your workbench');
    expect(textOf(view.root, 'p:nth-of-type(1)')).toBe(
      'Open the workbench in this browser, or restore a backup in a fresh browser profile.'
    );
    expect(linkByText(view.root, 'Open workbench')?.getAttribute('href')).toBe('/entities');
    expect(linkByText(view.root, 'Restore from backup')?.getAttribute('href')).toBe('/backup');
  });

  it('搜索界面和命中字段标签切换语言，记录内容与查询值保持原样', async () => {
    mocks.search.results.set([
      ASSET_HIT,
      { entity: 'Unregistered', collection: 'ghost', id: 'ghost-1', rank: 1, matchedField: 'title', snippet: '未登记记录' }
    ]);
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.resolve();
    await settle(view.harness);
    expect(resultLabels(view.root)).toEqual(['资产 · 名称', 'Unregistered · title']);

    await switchLocale(view.harness, 'en');
    expect(textOf(view.root, 'h2')).toBe('Full-text search');
    expect(resultLabels(view.root)).toEqual(['Assets · Name', 'Unregistered · title']);
    expect(view.root.textContent).toContain('研发笔记本');
    expect(view.root.textContent).toContain('未登记记录');
    const input = searchInput(view.root);
    expect(input.placeholder).toBe('Search categories, assets, and maintenance records…');
    expect(input.getAttribute('aria-label')).toBe('Full-text search');
    expect(input.value).toBe('笔记本');
  });

  it('搜索失败提示随语言更新并保留原始故障原因', async () => {
    mocks.search.state.set('error');
    mocks.search.error.set({ message: 'database unavailable' });
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.resolve();
    await settle(view.harness);
    expect(textOf(view.root, '[role="alert"]')).toBe('搜索失败：database unavailable');

    await switchLocale(view.harness, 'en');
    expect(textOf(view.root, '[role="alert"]')).toBe('Search failed: database unavailable');
  });

  it('未知实体的失败态翻译提示，保留实际路由身份', async () => {
    const view = await renderPage(entityListRoutes, '/entities/assets/Unknown', EntityListPage);
    expect(textOf(view.root, '[role="alert"]')).toContain('未找到实体 assets/Unknown');

    await switchLocale(view.harness, 'en');
    expect(textOf(view.root, '[role="alert"]')).toContain('Entity assets/Unknown was not found.');
  });

  it('没有可见实体时翻译空状态', async () => {
    mocks.database.config.entities = [];
    const view = await renderPage(entityShellRoutes, '/entities', EntityShell);
    expect(textOf(view.root, '[role="alert"]')).toBe('没有可见实体');

    await switchLocale(view.harness, 'en');
    expect(textOf(view.root, '[role="alert"]')).toBe('No visible entities');
  });
});

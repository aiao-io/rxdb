import type { EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import type { SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
import { Component, provideZonelessChangeDetection, signal, type Type, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@aiao/rxdb-angular', () => ({ useRxDB: () => mocks.database }));
vi.mock('@aiao/rxdb-plugin-search-angular', () => ({ useSearch: () => mocks.search }));
vi.mock('@aiao/rxdb-admin-angular', () => ({
  injectAdminStore: () => () => ({ extension: { searchPageSize: 20 } })
}));
vi.mock('@aiao/rxdb-model-angular', async () => {
  const { Component: component, Input: input } = await import('@angular/core');
  // 选择器与真实组件相同，页面模板才能匹配到替身；输入只用来观察页面透传的路由身份
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

interface RenderedPage {
  root: HTMLElement;
  harness: RouterTestingHarness;
}

let runtime: I18n;

/** 构造搜索替身；默认是已有一条命中的成功态，查询词为「笔记本」。 */
function createSearch(
  initial: { query?: string; results?: readonly SearchResult[]; state?: SearchState } = {}
): FakeSearch {
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
async function renderPage(routes: Routes, path: string, component: Type<object>): Promise<RenderedPage> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideI18n(runtime), provideRouter(routes)]
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(path, component);
  await settle(harness);
  return { root: harness.fixture.nativeElement as HTMLElement, harness };
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
  return container.querySelector(selector)?.textContent?.trim();
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
      {
        entity: 'Unregistered',
        collection: 'ghost',
        id: 'ghost-1',
        rank: 1,
        matchedField: 'title',
        snippet: '未登记记录'
      }
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

describe('实体页面渲染分支', () => {
  it('已登记的实体渲染实体列表并透传路由里的命名空间与名称，不出现失败态', async () => {
    const view = await renderPage(entityListRoutes, '/entities/assets/Asset', EntityListPage);
    const list = view.harness.fixture.debugElement.query(By.css('rxdb-entity-list'));
    expect(list.componentInstance).toMatchObject({ namespace: 'assets', name: 'Asset' });
    expect(view.root.querySelector('[data-testid="entity-load-failed"]')).toBeNull();
  });

  it('路由参数变化后失败态跟随新的实体身份', async () => {
    const view = await renderPage(entityListRoutes, '/entities/assets/Unknown', EntityListPage);
    expect(textOf(view.root, '[role="alert"]')).toContain('assets/Unknown');

    await view.harness.navigateByUrl('/entities/assets/Other');
    await settle(view.harness);
    expect(textOf(view.root, '[role="alert"]')).toContain('assets/Other');
    expect(textOf(view.root, '[role="alert"]')).not.toContain('assets/Unknown');
  });

  it('存在可见实体时访问实体壳页会重定向到首个实体，不显示空状态', async () => {
    const view = await renderPage(entityShellRoutes, '/entities', EntityShell);
    expect(TestBed.inject(Router).url).toBe('/entities/assets/Asset');
    expect(view.root.querySelector('[data-testid="entity-shell"]')).not.toBeNull();
    expect(view.root.querySelector('[data-testid="route-stub"]')).not.toBeNull();
    expect(view.root.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('搜索页连接与结果状态', () => {
  beforeEach(() => {
    mocks.search = createSearch({ query: '', results: [], state: 'idle' });
  });

  it('数据库连接期间显示可朗读的加载占位并随语言更新，连接成功后换成搜索界面', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    expect(view.root.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('加载中');
    expect(view.root.querySelector('[data-testid="search-page"]')).toBeNull();

    await switchLocale(view.harness, 'en');
    expect(view.root.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Loading');

    connection.resolve();
    await settle(view.harness);
    expect(view.root.querySelector('[role="status"]')).toBeNull();
    expect(view.root.querySelector('[data-testid="search-page"]')).not.toBeNull();
    expect(mocks.database.connect).toHaveBeenCalledWith('sqlite-wasm');
  });

  it('数据库连接失败时显示翻译后的标题并保留原始原因', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.reject(new Error('wasm blocked'));
    await settle(view.harness);
    const alert = view.root.querySelector('[data-testid="search-load-failed"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent?.trim()).toBe('加载失败wasm blocked');

    await switchLocale(view.harness, 'en');
    expect(alert?.textContent?.trim()).toBe('Loading failedwasm blocked');
    expect(view.root.querySelector('[data-testid="search-page"]')).toBeNull();
  });

  it.each([
    { locale: 'zh-Hans', expected: '加载失败搜索页初始化失败，请刷新重试' },
    { locale: 'en', expected: 'Loading failedSearch could not be initialized. Please refresh and try again.' }
  ])('连接失败原因不是错误对象时按失败当时的界面语言（$locale）显示统一提示', async ({ locale, expected }) => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    await switchLocale(view.harness, locale);

    connection.reject('blocked');
    await settle(view.harness);
    expect(textOf(view.root, '[data-testid="search-load-failed"]')).toBe(expected);
  });

  it('连接失败原因不是错误对象时，失败后切换语言统一提示随之重译', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.reject('blocked');
    await settle(view.harness);
    expect(textOf(view.root, '[data-testid="search-load-failed"]')).toBe('加载失败搜索页初始化失败，请刷新重试');

    await switchLocale(view.harness, 'en');
    expect(textOf(view.root, '[data-testid="search-load-failed"]')).toBe(
      'Loading failedSearch could not be initialized. Please refresh and try again.'
    );
  });

  it('连接以空消息的错误失败时仍显示失败态，不会一直停在加载占位', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.reject(new Error(''));
    await settle(view.harness);
    expect(view.root.querySelector('[data-testid="search-load-failed"]')).not.toBeNull();
    expect(view.root.querySelector('[role="status"]')).toBeNull();
  });

  it('搜索中、无匹配与有更多结果的提示随语言更新，空白查询不显示无匹配', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.resolve();
    await settle(view.harness);
    const status = (): string | undefined => textOf(view.root, '[data-testid="search-results"]');

    mocks.search.state.set('empty');
    await settle(view.harness);
    expect(status()).toBe('');

    mocks.search.query.set('没有的词');
    await settle(view.harness);
    expect(status()).toBe('无匹配结果');

    mocks.search.state.set('loading');
    await settle(view.harness);
    expect(status()).toBe('搜索中…');

    await switchLocale(view.harness, 'en');
    expect(status()).toBe('Searching…');
    mocks.search.state.set('empty');
    await settle(view.harness);
    expect(status()).toBe('No matching results');
  });

  it('有更多结果时显示加载更多按钮，点击触发翻页，加载中禁用并改写文案', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.resolve();
    await settle(view.harness);
    expect(view.root.querySelector('button')).toBeNull();

    mocks.search.state.set('success');
    mocks.search.hasMore.set(true);
    await settle(view.harness);
    const button = view.root.querySelector('button');
    expect(button?.textContent?.trim()).toBe('加载更多');
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(mocks.search.loadMore).toHaveBeenCalledTimes(1);

    mocks.search.state.set('loading');
    await settle(view.harness);
    expect(button?.textContent?.trim()).toBe('加载中…');
    expect(button?.disabled).toBe(true);

    await switchLocale(view.harness, 'en');
    expect(button?.textContent?.trim()).toBe('Loading…');
    mocks.search.state.set('success');
    await settle(view.harness);
    expect(button?.textContent?.trim()).toBe('Load more');
  });

  it('输入框的内容写回查询词', async () => {
    const connection = controlConnection();
    const view = await renderPage(searchRoutes, '/', SearchPage);
    connection.resolve();
    await settle(view.harness);
    const input = searchInput(view.root);

    input.value = '服务器';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(mocks.search.query()).toBe('服务器');
  });
});

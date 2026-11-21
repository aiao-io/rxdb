import { Entity, EntityBase, PropertyType, RxDB, SyncType, cloneEntityClasses, type EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import { useRenderTeamEditor } from './team-editor-renderer';

/** 列表替身：真实组件的选择器与输入，外加每次创建时登记自己、销毁时标记卸载，并能经注入的对话框服务打开对话框。 */
interface ListProbe {
  namespace: string;
  name: string;
  readonly database: unknown;
  readonly i18n: unknown;
  mounted: boolean;
  openDialog(): void;
  /** 像真实列表那样交出未保存状态（`dirtyChange` 输出）。 */
  reportDirty(dirty: boolean): void;
}

/** 对话框内容替身创建时读到的库。 */
interface DialogProbe {
  readonly database: unknown;
}

const mocks = vi.hoisted(() => ({
  anonymous: { name: 'anonymous-workbench' },
  lists: [] as ListProbe[],
  dialogs: [] as DialogProbe[],
  /** 协作包的 `reportDirty` 收到的报告，按顺序。 */
  reports: [] as boolean[]
}));

vi.mock('@aiao/rxdb-model-angular', async () => {
  const {
    Component: component,
    DestroyRef,
    EventEmitter: eventEmitter,
    Input: input,
    Output: output,
    inject
  } = await import('@angular/core');
  const { Dialog: dialog } = await import('@angular/cdk/dialog');
  const { RxDB: rxdb } = await vi.importActual<{ RxDB: typeof RxDB }>('@aiao/rxdb');
  const { useI18nRuntime } = await vi.importActual<{ useI18nRuntime: () => I18n | undefined }>(
    '@aiao/rxdb-i18n-angular'
  );
  // 对话框内容：与真实列表打开的详情对话框一样，经注入读取库
  @component({ selector: 'app-dialog-probe', template: '<p data-testid="dialog-probe"></p>' })
  class DialogProbeComponent {
    constructor() {
      mocks.dialogs.push({ database: inject(rxdb) });
    }
  }
  // 选择器与真实组件相同，编辑界面的模板才能匹配到替身
  @component({ selector: 'rxdb-entity-list', template: '<div data-testid="entity-list"></div>' })
  class EntityListComponent implements ListProbe {
    private readonly dialogs = inject(dialog);
    @input() namespace = '';
    @input() name = '';
    @output() readonly dirtyChange = new eventEmitter<boolean>();
    readonly database = inject(rxdb);
    readonly i18n = useI18nRuntime();
    mounted = true;
    constructor() {
      mocks.lists.push(this);
      inject(DestroyRef).onDestroy(() => {
        this.mounted = false;
      });
    }
    openDialog(): void {
      this.dialogs.open(DialogProbeComponent);
    }
    reportDirty(dirty: boolean): void {
      this.dirtyChange.emit(dirty);
    }
  }
  return { EntityListComponent };
});

/** 工作台可见命名空间内、预置实体之外的实体：编辑界面不认识任何具体实体名，只读库里的元数据。 */
@Entity({
  name: 'Gadget',
  namespace: 'assets',
  tableName: 'gadget',
  displayName: '小器件',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class Gadget extends EntityBase {
  title!: string;
}

/** 不在工作台可见命名空间内的实体：即使注册了也不给入口。 */
@Entity({
  name: 'HiddenThing',
  namespace: 'secret',
  tableName: 'hidden_thing',
  displayName: '隐藏实体',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class HiddenThing extends EntityBase {
  title!: string;
}

const databases: RxDB[] = [];
const containers: HTMLElement[] = [];
let runtime: I18n;
let dispose: (() => void) | undefined;

/** 注册给定实体的团队库替身：未初始化，只提供编辑界面读取的实体元数据。 */
function teamDatabase(entities: EntityType[] = cloneEntityClasses([...ENTITIES])): RxDB {
  const database = new RxDB({
    dbName: `team-editor-spec-${databases.length}`,
    context: { userId: 'team-user' },
    entities,
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  databases.push(database);
  return database;
}

/** 等零延迟调度的变更检测与随后的视图刷新全部完成：不手动 tick，验证附着到应用的视图会被零 Zone 调度器检查。 */
async function settle(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

/** 经协作包的渲染回调把编辑界面渲染进一个新容器。 */
async function show(database: RxDB = teamDatabase(), container?: HTMLElement): Promise<HTMLElement> {
  const target = container ?? document.body.appendChild(document.createElement('div'));
  containers.push(target);
  const render = TestBed.runInInjectionContext(() => useRenderTeamEditor());
  dispose = render(target, {
    database,
    task: { id: 'task-1', name: '年度盘点' },
    reportDirty: dirty => mocks.reports.push(dirty)
  });
  await settle();
  return target;
}

/** 卸载当前渲染的编辑界面。 */
async function hide(): Promise<void> {
  const unmount = dispose;
  dispose = undefined;
  unmount?.();
  await settle();
}

/** 容器里的页签按钮，按渲染顺序。 */
function tabs(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
}

/** 当前被选中的页签。 */
function selectedTab(container: HTMLElement): HTMLElement {
  const [selected, ...others] = tabs(container).filter(tab => tab.getAttribute('aria-selected') === 'true');
  if (!selected || others.length > 0) throw new Error('应当恰有一个选中的页签');
  return selected;
}

/** 容器里唯一的、带给定角色的元素。 */
function only(container: HTMLElement, role: string): HTMLElement {
  const found = container.querySelectorAll<HTMLElement>(`[role="${role}"]`);
  if (found.length !== 1 || !found[0]) throw new Error(`应当恰有一个 ${role}，实际 ${found.length} 个`);
  return found[0];
}

/** 最近一次挂载的列表。 */
function lastList(): ListProbe {
  const list = mocks.lists.at(-1);
  if (!list) throw new Error('列表尚未挂载');
  return list;
}

const labels = (container: HTMLElement): (string | null | undefined)[] =>
  tabs(container).map(tab => tab.textContent?.trim());

/** 点击页签并等视图刷新。 */
async function click(tab: HTMLElement | undefined): Promise<void> {
  tab?.click();
  await settle();
}

/** 在当前焦点元素上按键。 */
async function press(key: string): Promise<void> {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await settle();
}

/** 切换工作台语言并等视图刷新。 */
async function switchLocale(locale: string): Promise<void> {
  await runtime.setLocale(locale);
  await settle();
}

describe('团队任务编辑界面', () => {
  beforeEach(() => {
    runtime = createWorkbenchI18n();
    mocks.lists.length = 0;
    mocks.dialogs.length = 0;
    mocks.reports.length = 0;
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideI18n(runtime), { provide: RxDB, useValue: mocks.anonymous }]
    });
  });

  afterEach(async () => {
    await hide();
    for (const container of containers.splice(0)) container.remove();
    await Promise.all(databases.splice(0).map(database => database.destroy()));
    TestBed.resetTestingModule();
    runtime.destroy();
  });

  it('最外层元素固定高度、纵向排布，页签来自实体元数据且默认选中第一项', async () => {
    const container = await show();
    const root = container.firstElementChild as HTMLElement;
    expect(container.childElementCount).toBe(1);
    expect(root.getAttribute('data-testid')).toBe('team-editor');
    expect(root.style.height).toBe('32rem');
    expect(root.classList.contains('flex')).toBe(true);
    expect(root.classList.contains('flex-col')).toBe(true);

    expect(labels(container)).toEqual(['资产', '资产分类', '维护记录']);
    expect(selectedTab(container)).toBe(tabs(container)[0]);
    expect(tabs(container).map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs(container).map(tab => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('页签标签是本地化的显示名，切换语言后随之更新，选中项不变', async () => {
    const container = await show();
    await click(tabs(container)[1]);
    expect(labels(container)).toEqual(['资产', '资产分类', '维护记录']);

    await switchLocale('en');
    expect(labels(container)).toEqual(['Assets', 'Asset categories', 'Maintenance records']);
    expect(selectedTab(container).textContent?.trim()).toBe('Asset categories');

    await switchLocale('zh-Hans');
    expect(labels(container)).toEqual(['资产', '资产分类', '维护记录']);
  });

  it('页签组与面板带可访问名称：页签组用应用词条，面板由选中的页签命名', async () => {
    const container = await show();
    const panel = only(container, 'tabpanel');
    expect(only(container, 'tablist').getAttribute('aria-label')).toBe('任务数据');
    expect(panel.classList.contains('page-host')).toBe(true);
    expect(panel.classList.contains('flex-1')).toBe(true);
    for (const tab of tabs(container)) expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.id).not.toBe('');
    expect(document.getElementById(panel.getAttribute('aria-labelledby') ?? '')).toBe(selectedTab(container));

    await switchLocale('en');
    expect(only(container, 'tablist').getAttribute('aria-label')).toBe('Task data');
    expect(document.getElementById(panel.getAttribute('aria-labelledby') ?? '')?.textContent?.trim()).toBe('Assets');
  });

  it('列表收到当前页签的命名空间与名称，放在页签面板里', async () => {
    const container = await show();
    const panel = only(container, 'tabpanel');
    expect(panel.querySelectorAll('rxdb-entity-list')).toHaveLength(1);
    expect(mocks.lists).toHaveLength(1);
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'Asset', mounted: true });
  });

  it('点击页签切换实体：选中项随之变化，旧列表卸载，新列表重建并收到对应的命名空间与名称', async () => {
    const container = await show();
    const first = lastList();

    await click(tabs(container)[2]);
    expect(selectedTab(container)).toBe(tabs(container)[2]);
    expect(tabs(container).map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(first.mounted).toBe(false);
    expect(mocks.lists).toHaveLength(2);
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'AssetEvent', mounted: true });
    expect(
      document.getElementById(only(container, 'tabpanel').getAttribute('aria-labelledby') ?? '')?.textContent?.trim()
    ).toBe('维护记录');

    await click(tabs(container)[1]);
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'AssetCategory', mounted: true });
    expect(mocks.lists.filter(list => list.mounted)).toHaveLength(1);
  });

  it('方向键、Home 与 End 在页签间移动选中并聚焦，首尾相接', async () => {
    const container = await show();
    tabs(container)[0]?.focus();

    await press('ArrowRight');
    expect(selectedTab(container)).toBe(tabs(container)[1]);
    expect(document.activeElement).toBe(tabs(container)[1]);
    expect(lastList()).toMatchObject({ name: 'AssetCategory' });

    await press('End');
    expect(selectedTab(container)).toBe(tabs(container)[2]);
    await press('ArrowRight');
    expect(selectedTab(container)).toBe(tabs(container)[0]);
    await press('ArrowLeft');
    expect(selectedTab(container)).toBe(tabs(container)[2]);
    expect(document.activeElement).toBe(tabs(container)[2]);
    await press('Home');
    expect(selectedTab(container)).toBe(tabs(container)[0]);

    await press('ArrowDown');
    expect(selectedTab(container)).toBe(tabs(container)[0]);
  });

  it('列表拿到的是任务的团队库，而不是匿名工作台的库', async () => {
    const database = teamDatabase();
    const container = await show(database);
    await click(tabs(container)[1]);

    expect(mocks.lists).toHaveLength(2);
    for (const list of mocks.lists) {
      expect(list.database).toBe(database);
      expect(list.database).not.toBe(mocks.anonymous);
    }
  });

  it('列表交出的未保存状态原样转给协作包的 reportDirty；换了实体页签，新列表接着报告（ADMIN-US-205 AC#5）', async () => {
    const container = await show();
    lastList().reportDirty(true);
    lastList().reportDirty(false);
    expect(mocks.reports).toEqual([true, false]);

    await click(tabs(container)[1]);
    lastList().reportDirty(true);
    expect(lastList()).toMatchObject({ name: 'AssetCategory' });
    expect(mocks.reports).toEqual([true, false, true]);
  });

  it('列表拿到工作台的国际化运行时：实体与字段标签随工作台语言切换', async () => {
    const container = await show();
    await click(tabs(container)[1]);

    expect(mocks.lists).toHaveLength(2);
    for (const list of mocks.lists) expect(list.i18n).toBe(runtime);
  });

  it('列表弹出的对话框同样解析到团队库，卸载界面时一并关闭', async () => {
    const database = teamDatabase();
    await show(database);

    lastList().openDialog();
    await settle();
    expect(document.querySelectorAll('[data-testid="dialog-probe"]')).toHaveLength(1);
    expect(mocks.dialogs).toHaveLength(1);
    expect(mocks.dialogs[0]?.database).toBe(database);
    expect(mocks.dialogs[0]?.database).not.toBe(mocks.anonymous);
    // 对话框不随打开它的列表销毁；卸载界面时必须由渲染回调关掉
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);

    // 子注入器里重新提供的对话框服务随卸载一并销毁；应用级那份要到测试模块重置时才销毁
    const destroyed = vi.spyOn(Dialog.prototype, 'ngOnDestroy');
    try {
      await hide();
      expect(destroyed).toHaveBeenCalledTimes(1);
    } finally {
      destroyed.mockRestore();
    }
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid="dialog-probe"]')).toHaveLength(0);
  });

  it('只给出可见命名空间的实体，实体清单完全来自库的元数据', async () => {
    const container = await show(teamDatabase([Gadget, HiddenThing]));
    expect(labels(container)).toEqual(['小器件']);
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'Gadget' });
  });

  it('没有可见实体时显示空状态，不渲染页签与列表', async () => {
    const container = await show(teamDatabase([HiddenThing]));
    expect(only(container, 'alert').textContent?.trim()).toBe('没有可见实体');
    expect(tabs(container)).toHaveLength(0);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(mocks.lists).toHaveLength(0);

    await switchLocale('en');
    expect(only(container, 'alert').textContent?.trim()).toBe('No visible entities');
  });

  it('卸载函数卸载列表并清空容器，之后可在同一容器重新渲染', async () => {
    const container = await show();
    expect(lastList().mounted).toBe(true);

    await hide();
    expect(container.childElementCount).toBe(0);
    expect(container.innerHTML).toBe('');
    expect(mocks.lists.every(list => !list.mounted)).toBe(true);

    await show(teamDatabase(), container);
    expect(labels(container)).toEqual(['资产', '资产分类', '维护记录']);
    expect(lastList()).toMatchObject({ name: 'Asset', mounted: true });
  });
});

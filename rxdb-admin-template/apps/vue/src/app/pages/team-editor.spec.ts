import { Entity, EntityBase, PropertyType, RxDB, SyncType, cloneEntityClasses, type EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import type * as I18nVue from '@aiao/rxdb-i18n-vue';
import type * as RxDBVue from '@aiao/rxdb-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, type FunctionalComponent } from 'vue';
import { ENTITIES } from '../entities/asset-entities';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import { renderTeamEditor } from './team-editor-renderer';

/** 列表替身每次挂载登记的一条记录：入参、`useRxDB()` 读到的库，以及它此刻是否还挂着；还能弹出一个对话框。 */
interface ListProbe {
  readonly namespace: string;
  readonly name: string;
  readonly database: unknown;
  readonly i18n: unknown;
  mounted: boolean;
  openDialog(): void;
  /** 像真实列表那样交出未保存状态（`dirty-change` 事件）。 */
  reportDirty(dirty: boolean): void;
}

/** 对话框内容替身渲染时 `useRxDB()` 读到的库。 */
interface DialogProbe {
  readonly database: unknown;
}

const mocks = vi.hoisted(() => ({
  anonymous: { name: 'anonymous-workbench' },
  shell: { i18n: undefined as unknown as I18n },
  setup: vi.fn(),
  lists: [] as ListProbe[],
  dialogs: [] as DialogProbe[],
  /** 协作包的 `reportDirty` 收到的报告，按顺序。 */
  reports: [] as boolean[]
}));

vi.mock('../shell/workbench-shell', () => ({ workbenchShell: mocks.shell }));
vi.mock('../rxdb/setup_rxdb', () => ({ default: mocks.setup }));
// 列表替身用真实的 useRxDB() 读库：能证明库经 provideRxDB 交给了列表，而不是靠替身自己约定
vi.mock('@aiao/rxdb-model-vue', async () => {
  const { defineComponent, h, onUnmounted, ref, Teleport } = await import('vue');
  const { useRxDB } = await vi.importActual<typeof RxDBVue>('@aiao/rxdb-vue');
  const { useI18nRuntime } = await vi.importActual<typeof I18nVue>('@aiao/rxdb-i18n-vue');
  // 对话框内容：真实列表把对话框传送到 body 下，内容照样经 inject 读库
  const DialogContent: FunctionalComponent = () => {
    mocks.dialogs.push({ database: useRxDB() });
    return h('p', { 'data-testid': 'dialog-probe' });
  };
  const EntityList = defineComponent({
    props: { namespace: { type: String, required: true }, name: { type: String, required: true } },
    emits: { dirtyChange: (dirty: boolean) => typeof dirty === 'boolean' },
    setup(props, { emit }) {
      const open = ref(false);
      const probe: ListProbe = {
        namespace: props.namespace,
        name: props.name,
        database: useRxDB(),
        i18n: useI18nRuntime(),
        mounted: true,
        openDialog: () => {
          open.value = true;
        },
        reportDirty: dirty => emit('dirtyChange', dirty)
      };
      mocks.lists.push(probe);
      onUnmounted(() => {
        probe.mounted = false;
      });
      return () =>
        h('div', { 'data-testid': 'entity-list' }, open.value ? [h(Teleport, { to: 'body' }, [h(DialogContent)])] : []);
    }
  });
  return { EntityList };
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

/** 经协作包的渲染回调把编辑界面渲染进一个新容器。 */
async function show(database: RxDB = teamDatabase(), container?: HTMLElement): Promise<HTMLElement> {
  const target = container ?? document.body.appendChild(document.createElement('div'));
  containers.push(target);
  dispose = renderTeamEditor(target, {
    database,
    task: { id: 'task-1', name: '年度盘点' },
    reportDirty: dirty => mocks.reports.push(dirty)
  });
  await nextTick();
  return target;
}

/** 卸载当前渲染的编辑界面。 */
async function hide(): Promise<void> {
  const unmount = dispose;
  dispose = undefined;
  unmount?.();
  await nextTick();
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
  await nextTick();
}

/** 在当前焦点元素上按键。 */
async function press(key: string): Promise<void> {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await nextTick();
}

/** 切换工作台语言并等视图刷新。 */
async function switchLocale(locale: string): Promise<void> {
  await mocks.shell.i18n.setLocale(locale);
  await nextTick();
}

describe('团队任务编辑界面', () => {
  beforeEach(() => {
    mocks.shell.i18n = createWorkbenchI18n();
    mocks.setup.mockReset().mockReturnValue(mocks.anonymous);
    mocks.lists.length = 0;
    mocks.dialogs.length = 0;
    mocks.reports.length = 0;
  });

  afterEach(async () => {
    await hide();
    for (const container of containers.splice(0)) container.remove();
    await Promise.all(databases.splice(0).map(database => database.destroy()));
    mocks.shell.i18n.destroy();
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
    expect(panel.querySelectorAll('[data-testid="entity-list"]')).toHaveLength(1);
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
    expect(mocks.setup).not.toHaveBeenCalled();
  });

  it('列表弹出的对话框同样解析到团队库，卸载界面时一并关闭', async () => {
    const database = teamDatabase();
    await show(database);

    lastList().openDialog();
    await nextTick();
    expect(document.querySelectorAll('[data-testid="dialog-probe"]')).toHaveLength(1);
    expect(mocks.dialogs).toHaveLength(1);
    expect(mocks.dialogs[0]?.database).toBe(database);
    expect(mocks.dialogs[0]?.database).not.toBe(mocks.anonymous);

    await hide();
    expect(document.querySelectorAll('[data-testid="dialog-probe"]')).toHaveLength(0);
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
    for (const list of mocks.lists) expect(list.i18n).toBe(mocks.shell.i18n);
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

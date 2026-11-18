import { Entity, EntityBase, PropertyType, RxDB, SyncType, cloneEntityClasses, type EntityType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import type * as I18nReact from '@aiao/rxdb-i18n-react';
import type * as RxDBReact from '@aiao/rxdb-react';
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  dialogs: [] as DialogProbe[]
}));

vi.mock('../shell/workbench-shell', () => ({ workbenchShell: mocks.shell }));
vi.mock('../rxdb/setup_rxdb', () => ({ default: mocks.setup }));
// 列表替身用真实的 useRxDB() 读库：能证明库经 RxDBProvider 交给了列表，而不是靠替身自己约定
vi.mock('@aiao/rxdb-model-react', async () => {
  const { createElement, useEffect, useState } = await import('react');
  const { createPortal } = await import('react-dom');
  const { useRxDB } = await vi.importActual<typeof RxDBReact>('@aiao/rxdb-react');
  const { useI18nRuntime } = await vi.importActual<typeof I18nReact>('@aiao/rxdb-i18n-react');
  // 对话框内容：真实列表把对话框渲染到 body 下的门户里，内容照样经 context 读库
  const DialogContent = () => {
    const database = useRxDB();
    useEffect(() => {
      mocks.dialogs.push({ database });
    }, [database]);
    return createElement('p', { 'data-testid': 'dialog-probe' });
  };
  const EntityList = (props: { namespace: string; name: string }) => {
    const database = useRxDB();
    const i18n = useI18nRuntime();
    const [open, setOpen] = useState(false);
    // 只在组件实例创建时登记一次入参：同一实例收到新入参不算重建，只有换成新实例才登记新记录
    const [probe] = useState<ListProbe>(() => {
      const created: ListProbe = {
        namespace: props.namespace,
        name: props.name,
        database,
        i18n,
        mounted: true,
        openDialog: () => setOpen(true)
      };
      mocks.lists.push(created);
      return created;
    });
    useEffect(
      () => () => {
        probe.mounted = false;
      },
      [probe]
    );
    return createElement(
      'div',
      { 'data-testid': 'entity-list' },
      open ? createPortal(createElement(DialogContent), document.body) : null
    );
  };
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
  await act(async () => {
    dispose = renderTeamEditor(target, { database, task: { id: 'task-1', name: '年度盘点' } });
  });
  return target;
}

/** 卸载当前渲染的编辑界面。 */
async function hide(): Promise<void> {
  const unmount = dispose;
  dispose = undefined;
  await act(async () => unmount?.());
}

/** 容器里的页签按钮，按渲染顺序。 */
function tabs(container: HTMLElement): HTMLElement[] {
  return within(container).getAllByRole('tab');
}

/** 当前被选中的页签。 */
function selectedTab(container: HTMLElement): HTMLElement {
  const [selected, ...others] = tabs(container).filter(tab => tab.getAttribute('aria-selected') === 'true');
  if (!selected || others.length > 0) throw new Error('应当恰有一个选中的页签');
  return selected;
}

/** 最近一次挂载的列表。 */
function lastList(): ListProbe {
  const list = mocks.lists.at(-1);
  if (!list) throw new Error('列表尚未挂载');
  return list;
}

const labels = (container: HTMLElement): (string | null)[] => tabs(container).map(tab => tab.textContent);

describe('团队任务编辑界面', () => {
  beforeEach(() => {
    mocks.shell.i18n = createWorkbenchI18n();
    mocks.setup.mockReset().mockReturnValue(mocks.anonymous);
    mocks.lists.length = 0;
    mocks.dialogs.length = 0;
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
    await act(async () => within(container).getAllByRole('tab')[1]?.click());
    expect(labels(container)).toEqual(['资产', '资产分类', '维护记录']);

    await act(async () => mocks.shell.i18n.setLocale('en'));
    expect(labels(container)).toEqual(['Assets', 'Asset categories', 'Maintenance records']);
    expect(selectedTab(container).textContent).toBe('Asset categories');

    await act(async () => mocks.shell.i18n.setLocale('zh-Hans'));
    expect(labels(container)).toEqual(['资产', '资产分类', '维护记录']);
  });

  it('页签组与面板带可访问名称：页签组用应用词条，面板由选中的页签命名', async () => {
    const container = await show();
    expect(within(container).getByRole('tablist', { name: '任务数据' })).toBeTruthy();
    const panel = within(container).getByRole('tabpanel', { name: '资产' });
    expect(panel.classList.contains('page-host')).toBe(true);
    expect(panel.classList.contains('flex-1')).toBe(true);
    for (const tab of tabs(container)) expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(document.getElementById(panel.getAttribute('aria-labelledby') ?? '')).toBe(selectedTab(container));

    await act(async () => mocks.shell.i18n.setLocale('en'));
    expect(within(container).getByRole('tablist', { name: 'Task data' })).toBeTruthy();
    expect(within(container).getByRole('tabpanel', { name: 'Assets' })).toBe(panel);
  });

  it('列表收到当前页签的命名空间与名称，放在页签面板里', async () => {
    const container = await show();
    const panel = within(container).getByRole('tabpanel');
    expect(within(panel).getAllByTestId('entity-list')).toHaveLength(1);
    expect(mocks.lists).toHaveLength(1);
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'Asset', mounted: true });
  });

  it('点击页签切换实体：选中项随之变化，旧列表卸载，新列表重建并收到对应的命名空间与名称', async () => {
    const container = await show();
    const first = lastList();

    await act(async () => tabs(container)[2]?.click());
    expect(selectedTab(container)).toBe(tabs(container)[2]);
    expect(tabs(container).map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(first.mounted).toBe(false);
    expect(mocks.lists).toHaveLength(2);
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'AssetEvent', mounted: true });
    expect(within(container).getByRole('tabpanel', { name: '维护记录' })).toBeTruthy();

    await act(async () => tabs(container)[1]?.click());
    expect(lastList()).toMatchObject({ namespace: 'assets', name: 'AssetCategory', mounted: true });
    expect(mocks.lists.filter(list => list.mounted)).toHaveLength(1);
  });

  it('方向键、Home 与 End 在页签间移动选中并聚焦，首尾相接', async () => {
    const container = await show();
    const press = async (key: string) => {
      const focused = document.activeElement as HTMLElement;
      await act(async () => {
        fireEvent.keyDown(focused, { key });
      });
    };
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
    await act(async () => tabs(container)[1]?.click());

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

    await act(async () => lastList().openDialog());
    expect(document.querySelectorAll('[data-testid="dialog-probe"]')).toHaveLength(1);
    expect(mocks.dialogs).toHaveLength(1);
    expect(mocks.dialogs[0]?.database).toBe(database);
    expect(mocks.dialogs[0]?.database).not.toBe(mocks.anonymous);

    await hide();
    expect(document.querySelectorAll('[data-testid="dialog-probe"]')).toHaveLength(0);
  });

  it('列表拿到工作台的国际化运行时：实体与字段标签随工作台语言切换', async () => {
    const container = await show();
    await act(async () => tabs(container)[1]?.click());

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
    expect(within(container).getByRole('alert').textContent).toBe('没有可见实体');
    expect(within(container).queryAllByRole('tab')).toHaveLength(0);
    expect(within(container).queryByRole('tablist')).toBeNull();
    expect(mocks.lists).toHaveLength(0);

    await act(async () => mocks.shell.i18n.setLocale('en'));
    expect(within(container).getByRole('alert').textContent).toBe('No visible entities');
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

import { RxDB, SyncType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CollaborationOptions,
  TeamDatabaseFactory,
  TeamEditorContext,
  mountCollaboration
} from '@rxdb-admin-template/collaboration';
import { collaborationEnglish } from '@rxdb-admin-template/collaboration/messages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import { collaborationLabels } from '../entities/collaboration-labels';
import { createWorkbenchI18n } from '../i18n/workbench-i18n';
import CollaborationPage from './collaboration-page';

const mocks = vi.hoisted(() => ({
  database: { name: 'workbench-database' },
  shell: { i18n: undefined as unknown as I18n },
  dispose: vi.fn<() => void>(),
  mount: vi.fn<typeof mountCollaboration>(),
  readAnonymousRecords: vi.fn(),
  createTeamDatabase: vi.fn<TeamDatabaseFactory>()
}));

vi.mock('@rxdb-admin-template/collaboration', () => ({
  mountCollaboration: mocks.mount,
  readAnonymousRecords: mocks.readAnonymousRecords
}));
vi.mock('@aiao/rxdb-angular', () => ({ useRxDB: () => mocks.database }));
vi.mock('../rxdb/team-database', () => ({ createTeamDatabase: mocks.createTeamDatabase }));
vi.mock('../shell/workbench-shell', () => ({ workbenchShell: mocks.shell }));
// 编辑组件本身由 team-editor.spec 覆盖，这里只看渲染回调把它渲染进容器
vi.mock('./team-editor', async () => {
  const { Component: component } = await import('@angular/core');
  @component({ selector: 'app-team-editor', template: '<p data-testid="team-editor-stub"></p>' })
  class TeamEditor {}
  return { default: TeamEditor };
});

/** 协作界面交给匿名导入的数据模式清单：接线只原样转交，用一个最小的清单即可。 */
const schema = { schemaVersion: 1, entities: [] };

/** 取最近一次挂载收到的宿主元素与接线选项。 */
function lastMount(): { host: HTMLElement; options: CollaborationOptions } {
  const call = mocks.mount.mock.lastCall;
  if (!call) throw new Error('协作界面尚未挂载');
  const [host, options] = call;
  if (!options) throw new Error('协作界面挂载时没有收到选项');
  return { host, options };
}

const PLACEHOLDER = /\{(v\d+)\}/g;

/** 词条中的 {vN} 占位符名，按出现顺序。 */
function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map(match => match[1] ?? '');
}

/** 除 {vN} 占位符外不含 ICU 特殊字符，消息格式化器会原样输出其余文字。 */
function isLiteral(text: string): boolean {
  return !/['<>{}]/.test(text.replace(PLACEHOLDER, ''));
}

/** 取一条不含占位符的固定文案词条，用它观察语言切换。 */
function plainEntry(): { key: string; english: string } {
  const entry = Object.entries(collaborationEnglish).find(
    ([key, english]) =>
      isLiteral(key) && isLiteral(english) && placeholdersOf(key).length === 0 && placeholdersOf(english).length === 0
  );
  if (!entry) throw new Error('协作词条中没有可直接格式化的固定文案');
  return { key: entry[0], english: entry[1] };
}

/** 取一条带占位符的词条，并为其声明的每个占位符准备取值。 */
function placeholderEntry(): { key: string; english: string; values: Record<string, string> } {
  const entry = Object.entries(collaborationEnglish).find(([key, english]) => {
    const names = placeholdersOf(key);
    return (
      names.length > 0 &&
      isLiteral(key) &&
      isLiteral(english) &&
      names.every(name => placeholdersOf(english).includes(name))
    );
  });
  if (!entry) throw new Error('协作词条中没有可直接格式化的占位符文案');
  const names = placeholdersOf(entry[0]);
  return {
    key: entry[0],
    english: entry[1],
    values: Object.fromEntries(names.map((name, index) => [name, `#${index}`]))
  };
}

/** 按取值替换文案里的占位符，得到期望输出。 */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => values[name] ?? `{${name}}`);
}

/** 创建页面并等首帧渲染完成，此时 afterNextRender 回调已经执行。 */
async function renderPage() {
  const fixture = TestBed.createComponent(CollaborationPage);
  await fixture.whenStable();
  return fixture;
}

describe('协作页面接线', () => {
  beforeEach(() => {
    mocks.shell.i18n = createWorkbenchI18n();
    mocks.mount.mockReset().mockReturnValue(mocks.dispose);
    mocks.dispose.mockReset();
    mocks.readAnonymousRecords.mockReset();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    mocks.shell.i18n.destroy();
  });

  it('首帧渲染后把页面自己的宿主元素交给协作界面', async () => {
    const fixture = await renderPage();
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    const { host } = lastMount();
    expect(host.tagName).toBe('DIV');
    expect(host).toBe((fixture.nativeElement as HTMLElement).firstElementChild);
    expect(host.isConnected).toBe(true);
  });

  it('翻译委托工作台运行时，语言切换后输出对应语言并原样传递占位参数', async () => {
    await renderPage();
    const { translate } = lastMount().options;
    const plain = plainEntry();
    const withValues = placeholderEntry();
    if (!translate) throw new Error('缺少翻译接线');

    expect(translate(`collaboration.${plain.key}`, {})).toBe(plain.key);
    expect(translate(`collaboration.${withValues.key}`, withValues.values)).toBe(
      fill(withValues.key, withValues.values)
    );

    await mocks.shell.i18n.setLocale('en');
    expect(translate(`collaboration.${plain.key}`, {})).toBe(plain.english);
    expect(translate(`collaboration.${withValues.key}`, withValues.values)).toBe(
      fill(withValues.english, withValues.values)
    );
  });

  it('语言订阅在切换语言时通知监听器，退订后不再通知并释放运行时订阅', async () => {
    await renderPage();
    const { subscribeLanguage } = lastMount().options;
    if (!subscribeLanguage) throw new Error('缺少语言订阅接线');
    const listener = vi.fn();
    const unsubscribe = subscribeLanguage(listener);
    expect(mocks.shell.i18n.changes$.observed).toBe(true);

    listener.mockClear();
    await mocks.shell.i18n.setLocale('en');
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    expect(mocks.shell.i18n.changes$.observed).toBe(false);
    listener.mockClear();
    await mocks.shell.i18n.setLocale('zh-Hans');
    expect(listener).not.toHaveBeenCalled();
  });

  it('匿名导入用工作台数据库和全部预置实体读取资产，并原样返回读取结果', async () => {
    const records = { 'asset-1': { entity: 'Asset', fields: { name: '研发笔记本' } } };
    mocks.readAnonymousRecords.mockResolvedValue(records);
    await renderPage();
    const { importAnonymous } = lastMount().options;
    if (!importAnonymous) throw new Error('缺少匿名导入接线');

    await expect(importAnonymous(schema)).resolves.toBe(records);
    expect(mocks.readAnonymousRecords).toHaveBeenCalledTimes(1);
    const [database, entities, given] = mocks.readAnonymousRecords.mock.calls[0] ?? [];
    expect(database).toBe(mocks.database);
    expect(entities).toBe(ENTITIES);
    expect(given).toBe(schema);
  });

  it('把应用的实体与字段标签交给协作界面', async () => {
    await renderPage();
    expect(lastMount().options.labels).toBe(collaborationLabels);
  });

  it('把本端的团队库工厂交给协作界面', async () => {
    await renderPage();
    expect(lastMount().options.createTeamDatabase).toBe(mocks.createTeamDatabase);
  });

  it('编辑界面经协作界面给出的渲染回调进入容器，卸载函数卸干净', async () => {
    await renderPage();
    const { renderEditor } = lastMount().options;
    const database = new RxDB({
      dbName: 'collaboration-page-spec-team',
      entities: [],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    const context: TeamEditorContext = { database, task: { id: 'task-1', name: '年度盘点' }, reportDirty: vi.fn() };
    const container = document.body.appendChild(document.createElement('div'));
    try {
      const unmount = renderEditor(container, context);
      await TestBed.inject(ApplicationRef).whenStable();
      expect(container.querySelectorAll('[data-testid="team-editor-stub"]')).toHaveLength(1);

      unmount();
      expect(container.childElementCount).toBe(0);
    } finally {
      container.remove();
      await database.destroy();
    }
  });

  it('匿名导入读取失败时把原始错误交还协作界面处理', async () => {
    const failure = new Error('匿名库不可用');
    mocks.readAnonymousRecords.mockRejectedValue(failure);
    await renderPage();

    await expect(lastMount().options.importAnonymous?.(schema)).rejects.toBe(failure);
  });

  it('销毁时释放协作界面，且只释放一次', async () => {
    const fixture = await renderPage();
    expect(mocks.dispose).not.toHaveBeenCalled();

    fixture.destroy();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('首帧渲染前就销毁的页面不会挂载，也不会产生多余的释放', async () => {
    const early = TestBed.createComponent(CollaborationPage);
    early.destroy();
    const alive = await renderPage();

    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(lastMount().host).toBe((alive.nativeElement as HTMLElement).firstElementChild);
    expect(mocks.dispose).not.toHaveBeenCalled();
  });

  it('销毁后重新创建会重新接线，前一次挂载的释放不会重复', async () => {
    const first = await renderPage();
    const firstHost = lastMount().host;
    first.destroy();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);

    await renderPage();
    expect(mocks.mount).toHaveBeenCalledTimes(2);
    expect(lastMount().host).not.toBe(firstHost);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AdminConfigCommitComponent,
  AdminConfigStateComponent,
  type AdminConfigCommitView,
  type AdminConfigPermission
} from './admin-config-status';

const commitId = '10000000-0000-4000-8000-000000000101';
const authorId = '10000000-0000-4000-8000-000000000102';
const parentA = '10000000-0000-4000-8000-000000000103';
const parentB = '10000000-0000-4000-8000-000000000104';

const time = (iso: string): string =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const commit = (overrides: Partial<AdminConfigCommitView> = {}): AdminConfigCommitView => ({
  id: commitId,
  message: '调整海报模板',
  branchId: 'main',
  authorId,
  authorLabel: null,
  parentIds: [],
  status: 'synced',
  createdAt: '2026-11-16T02:00:00.000Z',
  appliedAt: null,
  releasedAt: null,
  rejectionCode: null,
  conflictMessage: null,
  ...overrides
});

const text = (root: HTMLElement): string => (root.textContent ?? '').replace(/\s+/g, ' ').trim();

const buttons = (root: HTMLElement): HTMLButtonElement[] => [...root.querySelectorAll('button')];

const button = (root: HTMLElement, name: string): HTMLButtonElement | undefined =>
  buttons(root).find(item => item.textContent?.trim() === name);

/** 读取描述列表里某个标签对应的值。 */
const fact = (root: HTMLElement, label: string): string | undefined => {
  const term = [...root.querySelectorAll('dt')].find(item => item.textContent?.trim() === label);
  return term?.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim();
};

beforeEach(() =>
  TestBed.configureTestingModule({
    imports: [AdminConfigStateComponent, AdminConfigCommitComponent]
  }).compileComponents()
);
afterEach(() => TestBed.resetTestingModule());

interface StateInputs {
  readonly permission: AdminConfigPermission;
  readonly loading?: boolean;
  readonly empty?: boolean;
  readonly offline?: boolean;
  readonly errorMessage?: string | null;
  readonly conflictMessage?: string | null;
  readonly syncLabel?: string | null;
}

function renderState(inputs: StateInputs): ComponentFixture<AdminConfigStateComponent> {
  const fixture = TestBed.createComponent(AdminConfigStateComponent);
  fixture.componentRef.setInput('entityLabel', '提示词模板');
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture;
}

describe('配置页状态', () => {
  it('无权限时只给出明确提示，不渲染任何可操作的控件', () => {
    const root = renderState({
      permission: 'denied',
      loading: true,
      offline: true,
      errorMessage: '读取被拒绝',
      conflictMessage: 'revision 已变化'
    }).nativeElement as HTMLElement;

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('没有提示词模板的管理权限');
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(buttons(root)).toEqual([]);
    expect(root.querySelector('a, input, select, textarea')).toBeNull();
    expect(text(root)).not.toContain('正在读取');
    expect(text(root)).not.toContain('冲突');
  });

  it('加载中、同步状态与离线提示放在礼貌播报的状态区域里', () => {
    const root = renderState({
      permission: 'granted',
      loading: true,
      offline: true,
      syncLabel: '已同步，待应用'
    }).nativeElement as HTMLElement;

    const status = root.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('正在读取提示词模板');
    expect(status?.textContent).toContain('同步状态：已同步，待应用');
    expect(status?.textContent).toContain('离线：修改只保存在本机，恢复网络后自动同步');
  });

  it('权限尚未确认时说明正在确认，而不是当作空列表', () => {
    const root = renderState({ permission: 'unknown', empty: true }).nativeElement as HTMLElement;

    expect(root.querySelector('[role="status"]')?.textContent).toContain('正在确认配置管理权限');
    expect(text(root)).not.toContain('还没有提示词模板');
  });

  it('空列表说明内容来源与生效方式，不伪造数据', () => {
    const root = renderState({ permission: 'granted', empty: true }).nativeElement as HTMLElement;

    const status = root.querySelector('[role="status"]')?.textContent ?? '';
    expect(status).toContain('当前工作区还没有提示词模板');
    expect(status).toContain('先保存在本机');
    expect(status).toContain('提交并应用后才会生效');
  });

  it('加载中或读取失败时不把空结果说成空列表', () => {
    expect(text(renderState({ permission: 'granted', empty: true, loading: true }).nativeElement)).not.toContain(
      '还没有提示词模板'
    );
    expect(
      text(renderState({ permission: 'granted', empty: true, errorMessage: '网络中断' }).nativeElement)
    ).not.toContain('还没有提示词模板');
  });

  it('读取失败显示原因，并提供可读名称明确的重新读取按钮', () => {
    const fixture = renderState({ permission: 'granted', errorMessage: '网络中断' });
    const root = fixture.nativeElement as HTMLElement;
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);

    const alert = [...root.querySelectorAll('[role="alert"]')].find(item => item.textContent?.includes('读取失败'));
    expect(alert?.textContent).toContain('读取失败：网络中断');
    const retry = button(root, '重新读取');
    expect(retry?.type).toBe('button');
    retry?.click();
    expect(retried).toBe(1);
  });

  it('冲突以警示播报，并说明本机修改保留与恢复方式', () => {
    const root = renderState({ permission: 'granted', conflictMessage: '模板 hero 已被其他提交修改' })
      .nativeElement as HTMLElement;

    const alert = [...root.querySelectorAll('[role="alert"]')].find(item => item.textContent?.includes('冲突'));
    expect(alert?.textContent).toContain('冲突：模板 hero 已被其他提交修改');
    expect(alert?.textContent).toContain('本机修改不会被覆盖');
    expect(alert?.textContent).toContain('重新读取后核对双方修改');
  });

  it('离线与读取失败同时存在时两条信息都保留', () => {
    const root = renderState({ permission: 'granted', offline: true, errorMessage: '网络中断' })
      .nativeElement as HTMLElement;

    expect(root.querySelector('[role="status"]')?.textContent).toContain('离线');
    expect(text(root)).toContain('读取失败：网络中断');
  });
});

interface CommitInputs {
  readonly commit: AdminConfigCommitView;
  readonly canManage: boolean;
  readonly busy?: boolean;
  readonly offline?: boolean;
}

function renderCommit(inputs: CommitInputs): ComponentFixture<AdminConfigCommitComponent> {
  const fixture = TestBed.createComponent(AdminConfigCommitComponent);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture;
}

describe('配置提交详情', () => {
  it.each([
    ['prepared', '只在本机'],
    ['synced', '已同步，待应用'],
    ['validated', '已校验，待应用'],
    ['applied', '已应用'],
    ['released', '已发布'],
    ['rejected', '已拒绝']
  ] as const)('状态 %s 用业务文案「%s」表达', (status, label) => {
    const root = renderCommit({ commit: commit({ status }), canManage: true }).nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="commit-status"]')?.textContent?.trim()).toBe(label);
  });

  it('以标题标注提交卡片，显示提交说明与操作者', () => {
    const root = renderCommit({ commit: commit({ authorLabel: '运营小王' }), canManage: true })
      .nativeElement as HTMLElement;

    const article = root.querySelector('article');
    const heading = root.querySelector(`#${article?.getAttribute('aria-labelledby')}`);
    expect(heading?.textContent).toContain('最近提交');
    expect(text(root)).toContain('调整海报模板');
    expect(text(root)).toContain('操作者：运营小王');
    expect(text(root)).not.toContain(`操作者：${authorId}`);
  });

  it('没有名称时把操作者 UUID 原样显示', () => {
    const root = renderCommit({ commit: commit(), canManage: true }).nativeElement as HTMLElement;
    expect(text(root)).toContain(`操作者：${authorId}`);
  });

  it('技术详情可折叠，列出分支、提交 ID 与全部父提交', () => {
    const root = renderCommit({
      commit: commit({ branchId: 'config-hero', parentIds: [parentA, parentB] }),
      canManage: true
    }).nativeElement as HTMLElement;

    const details = root.querySelector('details');
    expect(details?.querySelector('summary')?.textContent?.trim()).toBe('技术详情');
    const technical = details?.textContent ?? '';
    expect(technical).toContain('config-hero');
    expect(technical).toContain(commitId);
    expect(
      [...(details?.querySelectorAll('[data-testid="commit-parent"]') ?? [])].map(item => item.textContent?.trim())
    ).toEqual([parentA, parentB]);
  });

  it('没有父提交时明确写出', () => {
    const root = renderCommit({ commit: commit(), canManage: true }).nativeElement as HTMLElement;
    expect(root.querySelector('details')?.textContent).toContain('无父提交');
  });

  it('显示应用与发布时间，未发生时明确写出', () => {
    const pending = renderCommit({ commit: commit(), canManage: true }).nativeElement as HTMLElement;
    expect(text(pending)).toContain('应用：未应用');
    expect(text(pending)).toContain('发布：未发布');

    const appliedAt = '2026-11-16T03:00:00.000Z';
    const releasedAt = '2026-11-16T04:30:00.000Z';
    const done = renderCommit({ commit: commit({ status: 'released', appliedAt, releasedAt }), canManage: true })
      .nativeElement as HTMLElement;
    const times = [...done.querySelectorAll('time')].map(item => [
      item.getAttribute('datetime'),
      item.textContent?.trim()
    ]);
    expect(times).toContainEqual([appliedAt, time(appliedAt)]);
    expect(times).toContainEqual([releasedAt, time(releasedAt)]);
  });

  it('已知拒绝码翻成中文，未知码原样显示并标注', () => {
    const known = renderCommit({
      commit: commit({ status: 'rejected', rejectionCode: 'revision_conflict' }),
      canManage: true
    }).nativeElement as HTMLElement;
    expect(text(known)).toContain('拒绝原因：配置版本冲突');
    expect(text(known)).not.toContain('revision_conflict');

    const unknown = renderCommit({ commit: commit({ status: 'rejected', rejectionCode: 'quota_x' }), canManage: true })
      .nativeElement as HTMLElement;
    expect(text(unknown)).toContain('拒绝原因：未识别的拒绝码 quota_x');
  });

  it('冲突信息以警示播报', () => {
    const root = renderCommit({ commit: commit({ conflictMessage: '父提交尚未应用' }), canManage: true })
      .nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('冲突：父提交尚未应用');
  });

  it.each(['synced', 'validated'] as const)('%s 可应用，点击后输出提交 ID', status => {
    const fixture = renderCommit({ commit: commit({ status }), canManage: true });
    const root = fixture.nativeElement as HTMLElement;
    const applied: string[] = [];
    fixture.componentInstance.apply.subscribe(id => applied.push(id));

    expect(button(root, '执行安全回滚')).toBeUndefined();
    button(root, '应用提交')?.click();
    expect(applied).toEqual([commitId]);
  });

  it.each(['prepared', 'rejected'] as const)('%s 既不能应用也不能回滚', status => {
    const root = renderCommit({ commit: commit({ status }), canManage: true }).nativeElement as HTMLElement;
    expect(button(root, '应用提交')).toBeUndefined();
    expect(button(root, '执行安全回滚')).toBeUndefined();
  });

  it.each(['applied', 'released'] as const)('%s 回滚必须先在页内二次确认', async status => {
    const fixture = renderCommit({
      commit: commit({ status, appliedAt: '2026-11-16T03:00:00.000Z' }),
      canManage: true
    });
    const root = fixture.nativeElement as HTMLElement;
    const rolledBack: string[] = [];
    fixture.componentInstance.rollback.subscribe(id => rolledBack.push(id));

    button(root, '执行安全回滚')?.click();
    fixture.detectChanges();
    expect(rolledBack).toEqual([]);
    const confirmation = root.querySelector('[role="group"][aria-label="确认安全回滚"]');
    expect(confirmation?.textContent).toContain('调整海报模板');
    button(root, '取消')?.click();
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="确认安全回滚"]')).toBeNull();
    expect(rolledBack).toEqual([]);

    button(root, '执行安全回滚')?.click();
    fixture.detectChanges();
    button(root, '确认回滚')?.click();
    fixture.detectChanges();
    expect(rolledBack).toEqual([commitId]);
    expect(root.querySelector('[aria-label="确认安全回滚"]')).toBeNull();
  });

  it('忙碌或离线时禁用应用、回滚与确认', () => {
    for (const flags of [{ busy: true }, { offline: true }]) {
      const ready = renderCommit({ commit: commit({ status: 'validated' }), canManage: true, ...flags });
      expect(button(ready.nativeElement, '应用提交')?.disabled).toBe(true);

      const applied = renderCommit({ commit: commit({ status: 'applied' }), canManage: true });
      const root = applied.nativeElement as HTMLElement;
      button(root, '执行安全回滚')?.click();
      applied.detectChanges();
      for (const [name, value] of Object.entries(flags)) applied.componentRef.setInput(name, value);
      applied.detectChanges();
      expect(button(root, '执行安全回滚')?.disabled).toBe(true);
      expect(button(root, '确认回滚')?.disabled).toBe(true);
    }
    const offline = renderCommit({ commit: commit({ status: 'synced' }), canManage: true, offline: true });
    expect(text(offline.nativeElement)).toContain('离线时不能应用或回滚');
  });

  it('没有管理能力时不渲染任何动作按钮', () => {
    for (const status of ['synced', 'validated', 'applied', 'released'] as const) {
      const root = renderCommit({ commit: commit({ status }), canManage: false }).nativeElement as HTMLElement;
      expect(buttons(root)).toEqual([]);
    }
  });

  it('切换到另一个提交时收起未完成的回滚确认', () => {
    const fixture = renderCommit({ commit: commit({ status: 'applied' }), canManage: true });
    const root = fixture.nativeElement as HTMLElement;
    button(root, '执行安全回滚')?.click();
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="确认安全回滚"]')).not.toBeNull();

    fixture.componentRef.setInput('commit', commit({ id: '10000000-0000-4000-8000-000000000199', status: 'applied' }));
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="确认安全回滚"]')).toBeNull();
  });
});

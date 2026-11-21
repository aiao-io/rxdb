import {
  checkCommitExchangeBatch,
  computeCommitExchangeRecordFingerprint,
  parseCommitExchangeRecord,
  type CommitExchangeRecordJson
} from '@aiao/rxdb-plugin-working-tree/exchange';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page, type WebSocketRoute } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { diffRecords } from '../src/changes.js';
import type { Audit, ChangeSet, Commit, Records } from '../src/model.js';
import { fixtures } from './fixtures.js';
interface Account {
  id: string;
  email: string;
  otp: string;
}
interface Fixture {
  teamId: string;
  appId: string;
  name: string;
  admin: Account;
  reviewer: Account;
  secondReviewer: Account;
  secondary: { teamId: string; appId: string; name: string };
  invitation: string;
  token: string;
  /** 隔离栈的公开入口与公开 key：测试按页面里的会话直接读 Supabase 的只读投影。 */
  supabaseUrl: string;
  supabaseKey: string;
}
/**
 * 经全局登录页登录（全站都要登录），登录后回到 `target`（默认团队协作页）；顶栏出现这个账号的账号菜单即登录完成。
 */
async function login(page: Page, account: Account, target = '/collaboration') {
  await page.goto(`/login?redirect=${encodeURIComponent(target)}`);
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('验证码', { exact: true }).fill(account.otp);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(accountMenu(page)).toContainText(account.email);
}
/** 外壳顶栏的全局账号菜单（展开它的开关）。 */
const accountMenu = (page: Page) => page.getByTestId('account-menu').locator('summary');
/** 经顶栏账号菜单退出账号，回到登录页。 */
async function logout(page: Page) {
  await accountMenu(page).click();
  await page.getByTestId('account-menu').getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
}
/** 以页面里的会话向协作命令入口提交一条命令（唯一的写路径）。 */
async function api(page: Page, workspace: { teamId: string; appId: string }, command: Record<string, unknown>) {
  return page.evaluate(
    async ({ workspace, command }) => {
      const key = Object.keys(localStorage).find(key => key.startsWith('admin-collaboration-auth:'));
      if (!key) throw new Error('Missing authenticated test session');
      const session = JSON.parse(localStorage.getItem(key)!) as { access_token: string };
      const response = await fetch(`/collaboration-api/workspaces/${workspace.teamId}/${workspace.appId}/commands`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...command, operationId: crypto.randomUUID() })
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    { workspace, command }
  );
}
async function act(page: Page, workspace: { teamId: string; appId: string }, command: Record<string, unknown>) {
  const response = await api(page, workspace, command);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}
/**
 * 以页面里的会话直接读 Supabase：PostgREST 上 public 下的只读投影与读取函数，可见范围由 RLS 按这个会话裁决，
 * 与浏览器界面的读取同一条路径（读取不经协作命令入口）。
 */
async function rest(page: Page, fixture: Fixture, path: string) {
  return page.evaluate(
    async ({ url, key, path }) => {
      const storage = Object.keys(localStorage).find(item => item.startsWith('admin-collaboration-auth:'));
      if (!storage) throw new Error('Missing authenticated test session');
      const session = JSON.parse(localStorage.getItem(storage)!) as { access_token: string };
      const response = await fetch(`${url}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${session.access_token}` }
      });
      return { status: response.status, body: (await response.json()) as unknown };
    },
    { url: fixture.supabaseUrl, key: fixture.supabaseKey, path }
  );
}
/** 以页面里的会话调用一个读取函数（与浏览器的读取同样经 PostgREST 的 `rpc`，POST 带 JSON 参数）。 */
async function rpc(page: Page, fixture: Fixture, fn: string, args: Record<string, unknown>) {
  return page.evaluate(
    async ({ url, key, fn, args }) => {
      const storage = Object.keys(localStorage).find(item => item.startsWith('admin-collaboration-auth:'));
      if (!storage) throw new Error('Missing authenticated test session');
      const session = JSON.parse(localStorage.getItem(storage)!) as { access_token: string };
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      return { status: response.status, body: (await response.json()) as unknown };
    },
    { url: fixture.supabaseUrl, key: fixture.supabaseKey, fn, args }
  );
}
/**
 * 手工形成一个任务提交（平台 working-tree 的交换记录）：普通提交，唯一的父是 `parent`，全部单元共用提交 ID、
 * 不属于任何事务、来源 local，内容指纹由平台的 `computeCommitExchangeRecordFingerprint()` 计算——与客户端形成提交的做法相同。
 */
function exchangeCommit(id: string, parent: string, authorId: string, message: string, changes: ChangeSet[]): Commit {
  const draft = {
    commitId: id,
    parentIds: [parent],
    kind: 'normal' as const,
    message,
    authorId,
    createdAt: new Date().toISOString(),
    units: changes.map(change => ({ ...change, unitId: id, transactionId: null, origin: 'local' as const }))
  };
  return { ...draft, contentFingerprint: computeCommitExchangeRecordFingerprint(draft) };
}
async function rows<T>(page: Page, fixture: Fixture, path: string): Promise<T[]> {
  const response = await rest(page, fixture, path);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as T[];
}
const scope = (workspace: { teamId: string; appId: string }) =>
  `team_id=eq.${workspace.teamId}&app_id=eq.${workspace.appId}`;
/** 断言用的工作区状态：经只读投影读出的共享头与根、策略、任务、PR、审核、候选与全部审计（时间正序）。 */
async function state(page: Page, fixture: Fixture, workspace: { teamId: string; appId: string } = fixture) {
  const where = scope(workspace);
  const [row] = await rows<{ head: string; root: string; policy_version: number }>(
    page,
    fixture,
    `admin_workspaces?${where}&select=head,root,policy_version`
  );
  const tasks = await rows<{ id: string; name: string; origin_task_id: string | null; head: string }>(
    page,
    fixture,
    `admin_tasks?${where}&select=id,name,origin_task_id,head&order=seq`
  );
  const prs = await rows<{ id: string; task_id: string; title: string; revision: number; candidate_id: string | null }>(
    page,
    fixture,
    `admin_prs?${where}&select=id,task_id,title,revision,candidate_id&order=seq`
  );
  const reviews = await rows<{ decision: string; candidate_id: string | null }>(
    page,
    fixture,
    `admin_reviews?${where}&select=decision,candidate_id&order=seq`
  );
  const candidates = await rows<{ id: string; source: string; actor_id: string; policy_version: number }>(
    page,
    fixture,
    `admin_candidates?${where}&select=id,source,actor_id,policy_version&order=seq`
  );
  const audit = await rows<{ details: Audit }>(page, fixture, `admin_audit?${where}&select=details&order=seq`);
  return {
    head: row.head,
    root: row.root,
    policy: { version: row.policy_version },
    tasks: tasks.map(task => ({ id: task.id, name: task.name, originTaskId: task.origin_task_id, head: task.head })),
    prs: prs.map(pr => ({
      id: pr.id,
      taskId: pr.task_id,
      title: pr.title,
      revision: pr.revision,
      candidateId: pr.candidate_id
    })),
    reviews: reviews.map(review => ({ decision: review.decision, candidateId: review.candidate_id })),
    candidates: Object.fromEntries(
      candidates.map(item => [
        item.id,
        { id: item.id, source: item.source, actorId: item.actor_id, policyVersion: item.policy_version }
      ])
    ),
    audit: audit.map(event => event.details)
  };
}
/** 读取一个提交的元数据：经只读投影 `admin_commits`（交换记录去掉单元与内容指纹）。 */
async function commitOf(page: Page, fixture: Fixture, id: string) {
  const [row] = await rows<{ parent_ids: string[]; kind: string; author_id: string }>(
    page,
    fixture,
    `admin_commits?${scope(fixture)}&id=eq.${encodeURIComponent(id)}&select=parent_ids,kind,author_id`
  );
  expect(row, `commit ${id}`).toBeDefined();
  return { parentIds: row.parent_ids, kind: row.kind, authorId: row.author_id };
}
/** 邀请令牌只放在 URL fragment（`#join=<转义后的 JSON>`），不进查询参数，避免落入代理日志与 Referer。 */
/**
 * 填值并确认当前输入框里确实是这个值。
 *
 * 协作面板在异步加载、刷新完成后会整块重绘（`replaceChildren`）。Playwright 拿到元素与真正填值之间若恰好重绘，
 * 值会落进已脱离文档的旧元素：`input` 事件冒泡不到宿主，表单草稿记不住，新输入框是空的，随后发出去的就是空内容。
 * 定位器每次重新解析，断言不成立就对新元素重填。真实用户只在可见的元素上输入，事件照常冒泡，不受此影响。
 */
async function fillSettled(target: Locator, value: string) {
  await expect(async () => {
    await target.fill(value);
    await expect(target).toHaveValue(value, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}
/** 团队任务的编辑界面：应用用模型驱动组件（rxdb-model 的实体列表与表单）渲染团队库，标签来自实体元数据。 */
const editor = (page: Page) => page.getByTestId('team-editor');
/** 切到编辑界面里某个实体的页签（页签名是实体元数据的显示名）。 */
async function entityTab(page: Page, label: string) {
  const tab = editor(page).getByRole('tab', { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
/** 模型驱动对话框里的一个字段（按字段的显示名定位分组；必填字段的分组名带「 *」）。 */
const field = (page: Page, label: string) => page.getByRole('group', { name: new RegExp(`^${label}( \\*)?$`) });
/** 对话框里的关联下拉：选项由活查询异步填充，先等选项出现再按文本选择。 */
async function chooseRelation(page: Page, label: string, option: string) {
  const select = field(page, label).getByRole('combobox');
  await expect.poll(() => select.locator('option').count(), { timeout: 10000 }).toBeGreaterThan(1);
  await select.selectOption({ label: option });
}
/** 等页面上的有限动画结束（对话框与页签切换有入场动画，画布坐标要等它结束再换算）。 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        animation =>
          animation.timeline instanceof DocumentTimeline &&
          animation.effect?.getComputedTiming().iterations !== Infinity
      );
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
  });
}
/**
 * 在模型驱动对话框里给一个字段填值并让它失焦：三端表单都在失焦（`change`）时提交取值，Vue 的表单只在 `change` 时提交，
 * 填完直接点保存时最后一个字段可能还没提交。真实用户点保存之前同样会离开输入框。
 */
async function fillField(page: Page, label: string, value: string) {
  const input = field(page, label).locator('input');
  await fillSettled(input, value);
  await input.blur();
}
/**
 * 经「+ 新增」对话框在当前任务里新建一条记录并保存（与本机工作台的录入方式相同）：`values` 按字段显示名填文本、数字或日期，
 * `relations` 按字段显示名选关联记录。保存即写进团队库，经捕获进入任务工作树。
 */
async function createRecord(
  page: Page,
  entity: string,
  values: Record<string, string>,
  relations: Record<string, string> = {}
) {
  await entityTab(page, entity);
  await editor(page).getByRole('button', { name: '+ 新增', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
  for (const [label, value] of Object.entries(values)) await fillField(page, label, value);
  for (const [label, option] of Object.entries(relations)) await chooseRelation(page, label, option);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
}
interface TableCanvas {
  __vtable__?: {
    records?: Record<string, unknown>[];
    colCount: number;
    getHeaderField(col: number, row: number): unknown;
    scrollToCell(cell: { col: number; row: number }): void;
    scenegraph: { getCell(col: number, row: number): SceneNode };
  };
}
interface SceneNode {
  name?: string;
  globalAABBBounds: { x1: number; x2: number; y1: number; y2: number };
  forEachChildren(cb: (child: SceneNode) => void): void;
}
/** 编辑界面列表里当前实体的记录（VTable 画在画布上，记录从表格实例读）；只取给定字段，表格还没挂上时为 null。 */
async function listRecords(page: Page, fields: readonly string[]): Promise<Record<string, unknown>[] | null> {
  return editor(page)
    .locator('canvas')
    .first()
    .evaluate(
      (canvas, keys) => {
        const records = (canvas as unknown as TableCanvas).__vtable__?.records;
        return records ? records.map(record => Object.fromEntries(keys.map(key => [key, record[key]]))) : null;
      },
      [...fields]
    )
    .catch(() => null);
}
/**
 * 断言某个实体的列表里某个字段的取值恰好是这些（顺序无关），等列表跟上最新数据。每次重试都重新选页签：
 * 打开另一个任务时编辑界面整体换掉，页签回到第一项。
 */
async function expectList(page: Page, entity: string, name: string, expected: unknown[]) {
  await expect(async () => {
    await entityTab(page, entity);
    const values = ((await listRecords(page, [name])) ?? []).map(record => record[name]).sort();
    expect(values).toEqual([...expected].sort());
  }).toPass({ timeout: 15000 });
}
/** 列表第 `row` 行（从 1 起）操作列里名为 `icon` 的图标在页面上的坐标；图标不是 DOM 节点，按场景树换算。 */
async function actionIcon(page: Page, icon: string, row: number) {
  const canvas = editor(page).locator('canvas').first();
  await editor(page).scrollIntoViewIfNeeded();
  await settleAnimations(page);
  let hit: { x: number; y: number } | null = null;
  await expect(async () => {
    hit = await canvas.evaluate(
      async (element, [name, target]) => {
        const table = (element as unknown as TableCanvas).__vtable__!;
        const col = Array.from({ length: table.colCount }, (_, i) => i).find(
          c => table.getHeaderField(c, 0) === 'actions'
        );
        if (col === undefined) return null;
        table.scrollToCell({ col, row: target });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let found: SceneNode | undefined;
        const visit = (node: SceneNode): void => {
          if (!found && node.name === name) found = node;
          node.forEachChildren(visit);
        };
        visit(table.scenegraph.getCell(col, target));
        if (!found) return null;
        const box = found.globalAABBBounds;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + (box.y1 + box.y2) / 2 };
      },
      [icon, row] as const
    );
    expect(hit).not.toBeNull();
  }).toPass({ timeout: 15000 });
  return hit!;
}
/** 某个实体的列表里某个字段等于 `value` 的那一行（从 1 起）；每次重试都重新选页签（理由同 {@link expectList}）。 */
async function rowOf(page: Page, entity: string, name: string, value: unknown): Promise<number> {
  let row = -1;
  await expect(async () => {
    await entityTab(page, entity);
    row = ((await listRecords(page, [name])) ?? []).findIndex(record => record[name] === value) + 1;
    expect(row).toBeGreaterThan(0);
  }).toPass({ timeout: 15000 });
  return row;
}
/**
 * 打开列表里某条记录的详情（权限齐备时就是编辑模式），把字段从原值改成新值并保存。记录是异步灌进表单的：先等原值出现再改，
 * 否则填值会撞在灌值中间。`find` 是用来找到这条记录的字段与取值。
 */
async function editRecord(
  page: Page,
  entity: string,
  find: [string, unknown],
  changes: Record<string, [string, string]>
) {
  await entityTab(page, entity);
  const view = await actionIcon(page, 'view-action', await rowOf(page, entity, ...find));
  await page.mouse.click(view.x, view.y);
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
  for (const [label, [from, to]] of Object.entries(changes)) {
    await expect(field(page, label).locator('input')).toHaveValue(from);
    await fillField(page, label, to);
  }
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
}
/** 打开列表里某条记录的详情，读一个字段在表单里的值（只读核对用），再关闭对话框。 */
async function recordValue(page: Page, entity: string, find: [string, unknown], label: string) {
  await entityTab(page, entity);
  const view = await actionIcon(page, 'view-action', await rowOf(page, entity, ...find));
  await page.mouse.click(view.x, view.y);
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
  const input = field(page, label).locator('input');
  await expect(input).not.toHaveValue('');
  const value = await input.inputValue();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
  return value;
}
/** 删除列表里的一条记录（经删除确认）。 */
async function deleteRecord(page: Page, entity: string, find: [string, unknown]) {
  await entityTab(page, entity);
  const remove = await actionIcon(page, 'delete-action', await rowOf(page, entity, ...find));
  await page.mouse.click(remove.x, remove.y);
  await page.getByTestId('delete-confirm-submit').click();
  await expect
    .poll(async () => ((await listRecords(page, [find[0]])) ?? []).some(record => record[find[0]] === find[1]))
    .toBe(false);
}
/** 任务状态：已保存未提交、已提交未同步与已同步三种之一（任务视图里的状态行，`data-task-state` 标出是哪一种）。 */
const taskState = (page: Page) => page.locator('[data-task-state]');
/** 任务视图里「有未保存的输入」那一行：编辑界面的对话框里有还没保存的表单输入时才出现（ADMIN-US-205 AC#5）。 */
const unsavedInput = (page: Page) => page.locator('[data-unsaved-input]');
/**
 * 点「同步」并等它真的完成：提示可能还停在上一次同步的「当前提交已同步」，所以另外等任务状态变成已同步
 * （本机没有已保存未提交的改动，也没有远端头之后的本机提交）。
 */
async function syncTask(page: Page) {
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.locator('.collaboration')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.collaboration')).toHaveAttribute('aria-busy', 'false');
  await expect(taskState(page)).toHaveAttribute('data-task-state', 'synced');
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
}
/**
 * 新设备上第一次打开任务的时限：要先把服务端共享分支镜像进全新的团队库，再从任务起点建分支、导入任务已有的提交并切过去，
 * 是一串串行的下发与本地写入；Edge 模式下每个请求还可能碰上函数冷启动。单跑约 1～2 秒，整轮负载下偶尔超过默认的 5 秒。
 * 只放宽「等它打开」的时间，打开之后的断言一条不变。
 */
const firstOpenOnNewDevice = { timeout: 20_000 };
/**
 * 另一台设备：带上同一个登录会话（Supabase 的会话在 localStorage），但不带本机任务账本——真实的另一台设备上没有它，
 * 团队库（IndexedDB）也不随 storageState 复制。
 */
async function anotherDevice(browser: Browser, page: Page, baseURL: string | undefined) {
  const state = await page.context().storageState();
  const origins = state.origins.map(origin => ({
    ...origin,
    localStorage: origin.localStorage.filter(item => !item.name.startsWith('admin-collaboration-tasks-v1:'))
  }));
  return browser.newContext({ baseURL, storageState: { ...state, origins } });
}
/** 本机提交历史（任务状态条下方的折叠项）：展开后逐个提交的「消息 · 作者 ID · 提交 ID」（ID 取自 data 属性，界面上只显示短 ID 与邮箱）。 */
async function localCommits(page: Page) {
  const history = page.locator('details').filter({ has: page.locator('summary', { hasText: /^本机提交历史/ }) });
  if ((await history.getAttribute('open')) === null) await history.locator(':scope > summary').click();
  return history.locator('[data-commit-id]').evaluateAll(nodes =>
    nodes.map(node => {
      const item = node as HTMLElement;
      return `${item.querySelector('p')?.textContent} · ${item.dataset['authorId']} · ${item.dataset['commitId']}`;
    })
  );
}
/**
 * 进入团队：还没进团队时点团队卡片；已经在团队里时经顶栏的团队切换菜单——与重新进入同一个团队一样，会关闭打开着的任务、回到工作区。
 */
async function selectTeam(page: Page, name: string) {
  const switcher = page.getByTestId('team-switcher');
  if (await switcher.count()) await switcher.locator('summary').click();
  await page.getByRole('button', { name, exact: true }).click();
}
/** 切到顶栏下方的分区页签；页签名后面可能带计数（「数据 PR 2」「通知 1」），按前缀匹配。 */
async function openView(page: Page, name: '工作区' | '数据 PR' | '历史与审计' | '通知' | '成员与权限') {
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
/** 在工作区的「我的任务」里新建任务（基于当前共享版本），等它打开。 */
async function createTask(page: Page, name: string) {
  await openView(page, '工作区');
  await fillSettled(page.getByLabel('任务名称', { exact: true }), name);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: `任务：${name}`, exact: true })).toBeVisible();
}
/** 在数据 PR 分区里打开一个 PR：列表项的名称是「标题 · 状态」。 */
async function openPr(page: Page, name: string | RegExp) {
  await openView(page, '数据 PR');
  await page.getByRole('button', { name, exact: true }).click();
}
/** 在任务状态条上发起数据 PR：对话框里标题默认是任务名，可选地填说明；创建后页面切到这个 PR。 */
async function createPr(page: Page, description?: string) {
  await page.getByRole('button', { name: '创建 PR…', exact: true }).click();
  if (description !== undefined) await fillSettled(page.getByLabel('PR 说明', { exact: true }), description);
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 80_000 });
}
/** 顶栏「在线成员」下拉里的列表（Realtime Presence）；下拉收起时内容仍在文档里。 */
const presence = (page: Page) => page.getByTestId('presence');
/** 在线成员列表里某个成员的那一项（含他正在查看的位置）。 */
const presenceOf = (page: Page, userId: string) => presence(page).locator(`li[data-user-id="${userId}"]`);
function invitationLink(baseURL: string | undefined, fixture: Fixture, id = fixture.invitation, token = fixture.token) {
  const link = new URL('/collaboration', baseURL);
  const ticket = { teamId: fixture.teamId, appId: fixture.appId, id, token };
  link.hash = `join=${encodeURIComponent(JSON.stringify(ticket))}`;
  return link.toString();
}
async function accept(
  page: Page,
  fixture: Fixture,
  baseURL: string | undefined,
  id = fixture.invitation,
  token = fixture.token
) {
  await page.getByText('接受团队邀请', { exact: true }).click();
  await page.getByLabel('邀请链接', { exact: true }).fill(invitationLink(baseURL, fixture, id, token));
  await page.getByRole('button', { name: '接受邀请', exact: true }).click();
  // 提示出现时服务端已建立成员关系，后续授权与审批策略才能引用该成员
  await expect(page.getByText('邀请已接受', { exact: true })).toBeVisible();
}
test('真实身份、任务保存、离线同步、非作者审批和原子合并', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '采购电脑');
  await expect(editor(page)).toBeVisible();
  await expect(taskState(page)).toHaveText('已同步：本机与远端确认的版本一致');
  // 经模型驱动的实体列表与表单连续录入三种关联记录：每次保存都进任务工作树，不逐条提交
  await createRecord(page, '资产分类', { 分类名: '电脑' });
  await createRecord(page, '资产', { 名称: '工作站', 购入价: '120' }, { 分类: '电脑' });
  await createRecord(page, '维护记录', { 事项: '安装系统', 日期: '2026-11-16' }, { 所属资产: '工作站' });
  await expect(taskState(page)).toHaveText('有已保存未提交的改动（3 项）');
  expect((await new AxeBuilder({ page }).include('.collaboration').analyze()).violations).toEqual([]);
  // 未保存的表单输入不进工作树：对话框里填了值但没有保存就关掉，已保存未提交的仍是 3 项
  await entityTab(page, '资产分类');
  await editor(page).getByRole('button', { name: '+ 新增', exact: true }).click();
  await fillSettled(field(page, '分类名').locator('input'), '没有保存的分类');
  await expect(taskState(page)).toHaveText('有已保存未提交的改动（3 项）');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
  await expectList(page, '资产分类', 'name', ['电脑']);
  await page.reload();
  await selectTeam(page, fixture.name);
  await page.getByRole('button', { name: '打开任务：采购电脑', exact: true }).click();
  await expect(taskState(page)).toHaveText('有已保存未提交的改动（3 项）');
  expect(await recordValue(page, '资产', ['name', '工作站'], '购入价')).toBe('120');
  await page.context().setOffline(true);
  await editRecord(page, '资产', ['name', '工作站'], { 购入价: ['120', '130'] });
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('已形成提交，联网验证后可同步', { exact: true })).toBeVisible();
  await expect(taskState(page)).toHaveText('有已提交未同步的提交（1 个）');
  await page.context().setOffline(false);
  await syncTask(page);
  await expect(taskState(page)).toHaveText('已同步：本机与远端确认的版本一致');
  // 「创建 PR…」打开对话框：标题默认是任务名，目标是团队共享分支
  await page.getByRole('button', { name: '创建 PR…', exact: true }).click();
  await expect(page.getByLabel('PR 标题', { exact: true })).toHaveValue('采购电脑');
  await fillSettled(page.getByLabel('PR 说明', { exact: true }), '整单采购与安装');
  await expect(page.getByLabel('目标分支', { exact: true })).toHaveValue('shared');
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '采购电脑 · 待审核', exact: true })).toBeVisible();
  await expect(page.getByText('整单采购与安装', { exact: true })).toBeVisible();
  const reviewContext = await browser.newContext({ baseURL });
  const reviewPage = await reviewContext.newPage();
  await login(reviewPage, fixture.reviewer);
  await reviewPage.getByText('接受团队邀请', { exact: true }).click();
  await reviewPage.getByLabel('邀请链接', { exact: true }).fill(invitationLink(baseURL, fixture));
  await reviewPage.getByRole('button', { name: '接受邀请', exact: true }).click();
  await openPr(reviewPage, '采购电脑 · 待审核');
  await expect(reviewPage.getByRole('button', { name: '批准当前候选', exact: true })).toBeDisabled();
  await fillSettled(reviewPage.getByLabel('审核或撤销理由', { exact: true }), '请先确认采购范围');
  await reviewPage.getByRole('button', { name: '要求修改', exact: true }).click();
  // 阻塞意见显示审核者的邮箱，不显示账号 ID
  await expect(
    reviewPage.getByText(`要求修改：${fixture.reviewer.email} — 请先确认采购范围`, { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await expect(page.getByText('未解决冲突：0 · 检查错误：0', { exact: true })).toBeVisible();
  for (const tab of ['讨论', '提交', '检查', '数据变更']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: tab, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('存在未解除的要求修改', { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await reviewPage.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(reviewPage.getByText('审核：1/1 已满足', { exact: true })).toBeVisible();
  await expect(reviewPage.getByRole('button', { name: '合并到共享数据', exact: true })).toHaveCount(0);
  await selectTeam(page, fixture.name);
  await openPr(page, '采购电脑 · 待审核');
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  await fillSettled(page.getByLabel('新评论', { exact: true }), '请核对整单采购');
  await page.getByLabel('必须处理', { exact: true }).check();
  await page.getByLabel('提及成员', { exact: true }).selectOption(fixture.reviewer.id);
  await page.getByRole('button', { name: '发表评论', exact: true }).click();
  // 评论按作者分行显示：作者是成员邮箱，正文单独一段
  const adminComment = page.locator(`[data-author-id="${fixture.admin.id}"]`).filter({ hasText: '请核对整单采购' });
  await expect(adminComment).toContainText(fixture.admin.email);
  await expect(page.getByText('请核对整单采购', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '数据变更', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('必须处理的讨论尚未解决', { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  // 通知分区里新的在上：最新一条是被提及的那条讨论，点开即切到 PR 的讨论页签
  await openView(reviewPage, '通知');
  await reviewPage
    .getByRole('tabpanel', { name: /^通知/ })
    .getByRole('button')
    .filter({ hasText: '采购电脑' })
    .first()
    .click();
  await expect(reviewPage.getByRole('tab', { name: '讨论', exact: true })).toHaveAttribute('aria-selected', 'true');
  const adminText = reviewPage.getByText('请核对整单采购', { exact: true });
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('required');
  await expect(adminText).toBeVisible();
  for (const filter of ['open', 'current']) {
    await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption(filter);
    await expect(adminText).toBeVisible();
  }
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('mine');
  await expect(adminText).toHaveCount(0);
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('all');
  await fillSettled(reviewPage.getByLabel('回复', { exact: true }), '已核对采购范围');
  await reviewPage.getByRole('button', { name: '发送回复', exact: true }).click();
  await expect(
    reviewPage.locator(`[data-author-id="${fixture.reviewer.id}"]`).filter({ hasText: '已核对采购范围' })
  ).toContainText(fixture.reviewer.email);
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('mine');
  await reviewPage.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(reviewPage.getByRole('button', { name: '重新打开讨论', exact: true })).toBeVisible();
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('open');
  await expect(adminText).toHaveCount(0);
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('current');
  await expect(reviewPage.getByRole('button', { name: '重新打开讨论', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '采购电脑 · 已合并', exact: true })).toBeVisible();
  await openView(page, '工作区');
  const shared = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: `共享数据 · ${fixture.name}`, exact: true }) })
    .first();
  await expect(shared).toContainText('工作站');
  await expect(shared).toContainText('130');
  await expect(shared).toContainText('安装系统');
  // 历史与审计里新的在上：最新一次合并
  await openView(page, '历史与审计');
  const restore = page
    .locator('details')
    .filter({ has: page.getByRole('button', { name: '从此版本创建恢复草稿', exact: true, includeHidden: true }) })
    .first();
  await restore.locator(':scope > summary').click();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await expect(restore).toHaveAttribute('open', '');
  await restore.getByRole('button', { name: '从此版本创建恢复草稿', exact: true }).click();
  await expect(page.getByRole('heading', { name: /任务：恢复 / })).toBeVisible();
  expect(await recordValue(page, '资产', ['name', '工作站'], '购入价')).toBe('130');
  await expect(page.getByText(/待上传提交：0 · 已保存未提交：/)).toBeVisible();
  await expect(shared).toContainText('130');
  const firstHistory = await state(page, fixture);
  await editRecord(page, '资产', ['name', '工作站'], { 购入价: ['130', '125'] });
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await syncTask(page);
  await createPr(page);
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: /^恢复 .* · 待审核$/ })).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('缺少当前候选的有效批准', { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await openPr(reviewPage, /^恢复 .* · 待审核$/);
  await reviewPage.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(reviewPage.getByText('审核：1/1 已满足', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: /^恢复 .* · 已合并$/ })).toBeVisible();
  const finalHistory = await state(page, fixture);
  const otherHistory = await state(reviewPage, fixture);
  expect(otherHistory.head).toBe(finalHistory.head);
  expect(otherHistory.audit).toEqual(finalHistory.audit);
  expect(finalHistory.head).not.toBe(firstHistory.head);
  // 合并提交有两个父：第一父是合并前的共享头，第二父是任务头
  const finalMerge = await commitOf(page, fixture, finalHistory.head);
  expect(finalMerge.kind).toBe('merge');
  expect(finalMerge.parentIds).toHaveLength(2);
  expect(finalMerge.parentIds[0]).toBe(firstHistory.head);
  // 下发接口经 PostgREST：共享分支从零下发的一页交换记录能原样交给平台导入（批次形状合格、每个提交的指纹复算一致），
  // 从根起步、以共享头结束，两次合并带进来的任务提交都在
  const download = await rpc(page, fixture, 'admin_commit_exchange', {
    p_team_id: fixture.teamId,
    p_app_id: fixture.appId,
    p_ref: 'shared',
    p_known: [],
    p_limit: 100
  });
  expect(download.status, JSON.stringify(download.body)).toBe(200);
  const exchange = download.body as { head: string; more: boolean; commits: CommitExchangeRecordJson[] };
  const exchanged = exchange.commits.map(json => parseCommitExchangeRecord(json));
  expect(checkCommitExchangeBatch(exchanged)).toBeUndefined();
  for (const commit of exchanged)
    expect(computeCommitExchangeRecordFingerprint(commit), commit.commitId).toBe(commit.contentFingerprint);
  expect(exchange).toMatchObject({ head: finalHistory.head, more: false });
  expect(exchanged.map(commit => commit.kind).filter(kind => kind !== 'normal')).toEqual([
    'baseline',
    'merge',
    'merge'
  ]);
  expect(exchanged[0].commitId).toBe(finalHistory.root);
  expect(exchanged.at(-1)?.commitId).toBe(finalHistory.head);
  const merges = finalHistory.audit.filter(event => event.action === 'merge');
  expect(merges).toHaveLength(2);
  expect(
    finalHistory.reviews.filter(review => review.decision === 'approve').map(review => review.candidateId)
  ).toEqual(expect.arrayContaining(finalHistory.prs.map(pr => pr.candidateId)));
  for (const pr of finalHistory.prs) {
    const candidate = finalHistory.candidates[pr.candidateId!];
    expect(candidate.actorId).toBe(fixture.admin.id);
    expect(candidate.policyVersion).toBe(finalHistory.policy.version);
    expect((await commitOf(page, fixture, candidate.source)).authorId).toBe(fixture.admin.id);
    expect(
      merges.some(event => event.actorId === fixture.admin.id && JSON.stringify(event.details).includes(candidate.id))
    ).toBe(true);
  }
  await createTask(page, '级联删除预览');
  await expect(page.locator('.collaboration')).toHaveAttribute('aria-busy', 'false');
  // 删除分类连同引用它的资产与维护记录：外键在团队库里是 RESTRICT，按引用顺序从维护记录删起
  await deleteRecord(page, '维护记录', ['summary', '安装系统']);
  await deleteRecord(page, '资产', ['name', '工作站']);
  await deleteRecord(page, '资产分类', ['name', '电脑']);
  await expectList(page, '资产分类', 'name', []);
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await syncTask(page);
  await createPr(page);
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '级联删除预览 · 待审核', exact: true })).toBeVisible();
  const candidateRequests: string[] = [];
  await page.route('**/collaboration-api/workspaces/*/*/commands', async route => {
    const command = route.request().postDataJSON() as { type: string; operationId: string };
    if (command.type !== 'candidate') return route.continue();
    candidateRequests.push(command.operationId);
    if (candidateRequests.length === 1)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal', message: '服务暂时不可用，请稍后按原请求重试' })
      });
    await route.continue();
  });
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await expect(page.getByText('服务暂时不可用，请稍后按原请求重试', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '检查', exact: true }).click();
  await expect(page.getByText('尚未生成最终候选，检查未通过', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认或重试上次请求', exact: true }).click();
  await expect(page.getByText('未解决冲突：0 · 检查错误：0', { exact: true })).toBeVisible();
  expect(candidateRequests).toHaveLength(2);
  expect(candidateRequests[1]).toBe(candidateRequests[0]);
  await page.getByRole('tab', { name: '数据变更', exact: true }).click();
  const changes = page.getByRole('tabpanel', { name: '数据变更', exact: true });
  await expect(changes).toContainText('工作站');
  await expect(changes).toContainText('安装系统');
  expect(await changes.getByRole('cell', { name: '删除', exact: true }).count()).toBeGreaterThanOrEqual(3);
  await reviewContext.close();
});

test('对话框里没保存的输入：面板单独标出、同步被拦下、离开页面前提示，取消对话框后消失（ADMIN-US-205 AC#5）', async ({
  page,
  request
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '未保存输入');
  await expect(editor(page)).toBeVisible();
  await expect(unsavedInput(page)).toHaveCount(0);
  // 对话框里填了值、没点保存：面板在三种状态之外另起一行标出，已保存的工作树仍是已同步
  await entityTab(page, '资产分类');
  await editor(page).getByRole('button', { name: '+ 新增', exact: true }).click();
  await fillField(page, '分类名', '还没保存的分类');
  await expect(unsavedInput(page)).toHaveText('有未保存的输入：先在编辑界面里保存或取消，才能同步或切换任务');
  await expect(taskState(page)).toHaveText('已同步：本机与远端确认的版本一致');
  // 同步被拦下并说明：对话框是模态的，鼠标点不到面板，键盘仍可能把焦点移过去，这里直接派发点击
  await page.getByRole('button', { name: '同步', exact: true, includeHidden: true }).dispatchEvent('click');
  await expect(page.getByText('先在编辑界面里保存或取消未保存的输入', { exact: true })).toBeVisible();
  await expect(taskState(page)).toHaveText('已同步：本机与远端确认的版本一致');
  // 离开页面：浏览器先问一句（beforeunload），选择留下，页面与输入都还在
  const prompts: string[] = [];
  page.on('dialog', async dialog => {
    prompts.push(dialog.type());
    await dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => prompts).toEqual(['beforeunload']);
  expect(page.isClosed()).toBe(false);
  await expect(field(page, '分类名').locator('input')).toHaveValue('还没保存的分类');
  // 取消对话框：输入随之作废，那一行消失，列表里没有这条记录，离开页面不再提示
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
  await expect(unsavedInput(page)).toHaveCount(0);
  await expectList(page, '资产分类', 'name', []);
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(prompts).toEqual(['beforeunload']);
});

test('离线冷启动只恢复有效授权上下文；过期和退出会锁定保留的草稿', async ({ page, request }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '离线保留');
  await createRecord(page, '资产分类', { 分类名: '离线机密草稿' });
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  // 打开任务时团队库才懒加载 sqlite-wasm：离线外壳在那之后重新缓存一次，冷启动才打得开团队库
  await expect(page.locator('.collaboration')).toHaveAttribute('data-offline-ready', 'true');
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '离线任务：离线保留', exact: true }).click();
  await expectList(page, '资产分类', 'name', ['离线机密草稿']);
  await page.evaluate(() => {
    const key = 'admin-collaboration-grant:/collaboration-api';
    const grant = JSON.parse(localStorage.getItem(key)!);
    grant.expiresAt = 1;
    localStorage.setItem(key, JSON.stringify(grant));
  });
  // 缓存授权过期：全站登录门禁把页面带到登录页，草稿内容不显示
  await page.reload();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(page.getByText('离线机密草稿', { exact: true })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  // 联网后本机会话仍有效：登录页确认身份后直接回到团队协作
  await page.context().setOffline(false);
  await page.reload();
  await expect(page).toHaveURL(/\/collaboration$/);
  await selectTeam(page, fixture.name);
  await page.getByRole('button', { name: '打开任务：离线保留', exact: true }).click();
  await expectList(page, '资产分类', 'name', ['离线机密草稿']);
  await logout(page);
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
  // 退出只锁定、不删除：团队库（按用户 × 团队 × 应用散列命名的 sqlite-wasm IndexedDB 库）与本机任务账本都还在，账本里的任务已锁定
  const kept = await page.evaluate(async userId => {
    const databases = await indexedDB.databases();
    const ledger = JSON.parse(localStorage.getItem(`admin-collaboration-tasks-v1:${userId}`) ?? '[]') as {
      name: string;
      locked: boolean;
    }[];
    return {
      team: databases.some(database => /-[0-9a-f]{20}@0_1\.sqlite\.db$/.test(database.name ?? '')),
      tasks: ledger.map(entry => [entry.name, entry.locked])
    };
  }, fixture.admin.id);
  expect(kept).toEqual({ team: true, tasks: [['离线保留', true]] });
  await page.goto('/collaboration');
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(page.getByText('离线机密草稿', { exact: true })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
});

test('错误账号不能消费邀请；验证码不可重复登录', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByText('接受团队邀请', { exact: true }).click();
  const link = invitationLink(baseURL, fixture);
  await page.getByLabel('邀请链接', { exact: true }).fill(link);
  await page.getByRole('button', { name: '接受邀请', exact: true }).click();
  await expect(page.getByText('邀请无效或登录邮箱不匹配，请切换账号', { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await other.getByText('接受团队邀请', { exact: true }).click();
  await other.getByLabel('邀请链接', { exact: true }).fill(link);
  await other.getByRole('button', { name: '接受邀请', exact: true }).click();
  await expect(other.getByText('邀请已接受', { exact: true })).toBeVisible();
  await logout(other);
  await expect(other.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await other.getByLabel('邮箱', { exact: true }).fill(fixture.reviewer.email);
  await other.getByLabel('验证码', { exact: true }).fill(fixture.reviewer.otp);
  await other.getByRole('button', { name: '登录', exact: true }).click();
  // 用过的验证码登录失败：留在登录页并说明原因，顶栏没有账号菜单
  await expect(other.getByRole('status').filter({ hasText: /expired|invalid|过期|无效/i })).toBeVisible();
  await expect(other).toHaveURL(/\/login\?redirect=/);
  await expect(other.getByTestId('account-menu')).toHaveCount(0);
  await context.close();
});

test('匿名资产只在预览确认后复制到任务，原库与共享分支均保持原样', async ({ page, request }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  // 全站都要登录：先登录，再在本机工作台录入（本机库按设备共用）
  await login(page, fixture.admin, '/entities/assets/AssetCategory');
  await page.getByRole('button', { name: '+ 新增', exact: true }).click();
  await page.getByRole('group', { name: '分类名' }).getByRole('textbox').fill('匿名保留分类');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
  await page.goto('/collaboration');
  await selectTeam(page, fixture.name);
  await expect(page.getByRole('heading', { name: '任务：导入本机资产', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '预览匿名数据导入', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 条本机记录');
  await expect(page.getByRole('dialog')).toContainText('匿名保留分类');
  await page.getByRole('button', { name: '确认复制到新任务', exact: true }).click();
  // 匿名记录作为普通编辑写进新任务的工作树：已保存、未提交，也没有上传
  await expectList(page, '资产分类', 'name', ['匿名保留分类']);
  await expect(taskState(page)).toHaveText('有已保存未提交的改动（1 项）');
  await expect(page.getByText('共享版本：空分支 · 默认只读', { exact: true })).toBeVisible();
  await page.goto('/entities/assets/AssetCategory');
  await expect
    .poll(() =>
      page
        .getByTestId('entity-shell')
        .locator('canvas')
        .first()
        .evaluate(canvas => {
          const table = (canvas as HTMLCanvasElement & { __vtable__?: { records?: { name?: string }[] } }).__vtable__;
          return table?.records?.map(record => record.name);
        })
    )
    .toContain('匿名保留分类');
});

test('语言切换保留未保存输入，产品文案与用户数据分离', async ({ page, request }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '语言草稿');
  // 用户数据恰好与产品文案同名：语言切换只翻译产品文案，记录原样显示
  await createRecord(page, '资产分类', { 分类名: '同步' });
  // 协作面板里还没提交的输入在语言切换重绘之后保留
  await fillSettled(page.getByLabel('任务名称', { exact: true }), '保留的输入');
  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(
    page.locator('.collaboration').getByRole('heading', { name: 'Team collaboration', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Task name', { exact: true })).toHaveValue('保留的输入');
  await expect(taskState(page)).toHaveText('Saved but uncommitted changes (1)');
  // 编辑界面的实体与字段标签来自实体元数据，随应用语言切换
  await expectList(page, 'Asset categories', 'name', ['同步']);
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(page.getByText('Current commits synced; later edits still need syncing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create PR…', exact: true }).click();
  await page.getByLabel('PR title', { exact: true }).fill('同步');
  await page.getByRole('button', { name: 'Create PR', exact: true }).click();
  await expect(page.getByRole('heading', { name: '同步', exact: true })).toBeVisible();
  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: /简体中文/ }).click();
  await openView(page, '工作区');
  await expect(page.getByRole('button', { name: '同步', exact: true })).toBeVisible();
  await expectList(page, '资产分类', 'name', ['同步']);
});

test('跨设备分叉另存后可恢复原任务远端，两个版本均保留', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '双设备任务');
  await createRecord(page, '资产分类', { 分类名: '共同起点' });
  await syncTask(page);
  const otherContext = await anotherDevice(browser, page, baseURL);
  const other = await otherContext.newPage();
  await other.goto('/collaboration');
  await selectTeam(other, fixture.name);
  await other.getByRole('button', { name: '打开任务：双设备任务', exact: true }).click();
  await expect(other.getByRole('heading', { name: '任务：双设备任务', exact: true })).toBeVisible(firstOpenOnNewDevice);
  await editRecord(other, '资产分类', ['name', '共同起点'], { 分类名: ['共同起点', '设备乙版本'] });
  await syncTask(other);
  await editRecord(page, '资产分类', ['name', '共同起点'], { 分类名: ['共同起点', '设备甲版本'] });
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('任务已分叉，请另存为新任务', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '拉取远端版本', exact: true })).toBeVisible();
  // 「另存为新任务…」打开对话框，名称默认是「原任务名（分叉）」
  await page.getByRole('button', { name: '另存为新任务…', exact: true }).click();
  await expect(page.getByLabel('另存任务名称', { exact: true })).toHaveValue('双设备任务（分叉）');
  await fillSettled(page.getByLabel('另存任务名称', { exact: true }), '保留设备甲');
  await page.getByRole('button', { name: '另存为新任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：保留设备甲', exact: true })).toBeVisible();
  await expectList(page, '资产分类', 'name', ['设备甲版本']);
  await page.getByRole('button', { name: '打开任务：双设备任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：双设备任务', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '拉取远端版本', exact: true }).click();
  await expectList(page, '资产分类', 'name', ['设备乙版本']);
  await page.getByRole('button', { name: '打开任务：保留设备甲', exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：保留设备甲', exact: true })).toBeVisible();
  await expectList(page, '资产分类', 'name', ['设备甲版本']);
  await createPr(page);
  await expect(page.getByRole('button', { name: '保留设备甲 · 草稿', exact: true })).toBeVisible();
  const forked = await state(page, fixture);
  const forkTask = forked.tasks.find(task => task.name === '保留设备甲')!;
  const originalTask = forked.tasks.find(task => task.name === '双设备任务')!;
  expect(forkTask.originTaskId).toBe(originalTask.id);
  expect(forked.prs.find(pr => pr.title === '保留设备甲')?.taskId).toBe(forkTask.id);
  expect((await commitOf(page, fixture, forkTask.head)).authorId).toBe(fixture.admin.id);
  expect(forkTask.head).not.toBe(originalTask.head);
  await otherContext.close();
});

test('两阶段审批、在线成员和越权合并拒绝', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await openView(page, '成员与权限');
  await page.getByRole('button', { name: '添加审批阶段', exact: true }).click();
  await page.getByLabel('阶段名称', { exact: true }).nth(1).fill('财务复核');
  await page.getByLabel('等待前面所有阶段', { exact: true }).nth(1).check();
  await page.getByRole('button', { name: '保存审批策略', exact: true }).click();
  await expect(page.getByRole('heading', { name: '审批策略 v2', exact: true })).toBeVisible();
  await createTask(page, '分级采购');
  await createRecord(page, '资产分类', { 分类名: '已核对分类' });
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await syncTask(page);
  await createPr(page);
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '分级采购 · 待审核', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await expect(page.getByText('财务复核：0/1 待批准', { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await other.getByText('接受团队邀请', { exact: true }).click();
  await other.getByLabel('邀请链接', { exact: true }).fill(invitationLink(baseURL, fixture));
  await other.getByRole('button', { name: '接受邀请', exact: true }).click();
  await openPr(other, '分级采购 · 待审核');
  await other.getByLabel('审批阶段', { exact: true }).selectOption({ label: '财务复核' });
  await other.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(other.getByText('前置审批阶段尚未完成', { exact: true })).toBeVisible();
  await other.getByLabel('审批阶段', { exact: true }).selectOption({ label: '审核' });
  await other.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(other.getByText('审核：1/1 已满足', { exact: true })).toBeVisible();
  await expect(page.getByText('审核：1/1 已满足', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('缺少当前候选的有效批准', { exact: true })).toBeVisible();
  await other.getByLabel('审批阶段', { exact: true }).selectOption({ label: '财务复核' });
  await other.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(other.getByText('财务复核：1/1 已满足', { exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: '合并到共享数据', exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
        return presence(page).textContent();
      },
      { timeout: 20000, intervals: [1000] }
    )
    .toContain(fixture.reviewer.email);
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '分级采购 · 已合并', exact: true })).toBeVisible();
  await context.close();
});

test('双团队切换保留本机任务并隔离查询、通知与在线成员', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '甲团队草稿');
  await createRecord(page, '资产分类', { 分类名: '仅甲团队可见' });
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await selectTeam(page, fixture.secondary.name);
  await expect(page.getByRole('button', { name: '打开任务：甲团队草稿', exact: true })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  await createTask(page, '乙团队任务');
  // 乙团队是另一个团队库：甲团队的草稿不在这里
  await expectList(page, '资产分类', 'name', []);
  await createRecord(page, '资产分类', { 分类名: '仅乙团队可见' });
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await syncTask(page);
  await selectTeam(page, fixture.name);
  await page.getByRole('button', { name: '打开任务：甲团队草稿', exact: true }).click();
  await expectList(page, '资产分类', 'name', ['仅甲团队可见']);
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await expect(other.getByRole('button', { name: fixture.name, exact: true })).toHaveCount(0);
  await accept(other, fixture, baseURL);
  await expect(other.getByRole('button', { name: fixture.secondary.name, exact: true })).toHaveCount(0);
  // 跨团队、跨应用读取经 RLS 返回空（不是错误），乙团队的数据一条也读不到
  for (const view of ['admin_workspaces', 'admin_tasks', 'admin_prs', 'admin_audit', 'shared_records']) {
    const denied = await rest(other, fixture, `${view}?${scope(fixture.secondary)}&select=*`);
    expect(denied, view).toEqual({ status: 200, body: [] });
  }
  const commits = await rest(
    other,
    fixture,
    `rpc/admin_commit_history?p_team_id=${fixture.secondary.teamId}&p_app_id=assets&p_from=x&p_until=y&p_limit=10`
  );
  expect(commits).toEqual({ status: 200, body: null });
  expect(
    await rest(other, fixture, `admin_workspaces?${scope({ teamId: fixture.teamId, appId: 'other-app' })}&select=*`)
  ).toEqual({ status: 200, body: [] });
  // 在线状态经 Realtime Presence：受邀者的页面进入团队即上报，不调用命令接口（presence 命令已不存在）
  expect(
    (await api(other, fixture, { type: 'presence', sessionId: 'scoped', prId: null, recordId: null, leave: false }))
      .status
  ).toBe(409);
  await expect(presence(page)).toContainText(fixture.reviewer.email);
  await selectTeam(page, fixture.secondary.name);
  await expect(presence(page)).not.toContainText(fixture.reviewer.email);
  await page.getByRole('button', { name: '打开任务：乙团队任务', exact: true }).click();
  await expectList(page, '资产分类', 'name', ['仅乙团队可见']);
  expect((await state(page, fixture)).tasks.map(task => task.name)).toEqual(['甲团队草稿']);
  expect((await state(page, fixture, fixture.secondary)).tasks.map(task => task.name)).toEqual(['乙团队任务']);
  await context.close();
});

test('六项权限独立生效，指定审核人与并行人数门槛不能绕过', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  // 新工作区还没有合并：共享头就是根
  const { root } = await state(page, fixture);
  /** 以 `current`（共享头 `head` 时的记录）为起点，提交一份把分类改名为 `id` 的字段级变更（平台交换记录）。 */
  const prepare = async (id: string, head: string, current: Records) => {
    await act(page, fixture, { type: 'task', id, name: id, expectedHead: head });
    const changes = diffRecords(
      current,
      { category: { entity: 'AssetCategory', fields: { name: id } } },
      () => 'assets'
    );
    await act(page, fixture, {
      type: 'upload',
      taskId: id,
      expectedHead: head,
      commits: [exchangeCommit(`commit-${id}`, head, fixture.admin.id, id, changes)]
    });
    await act(page, fixture, { type: 'pr', id, taskId: id, title: id, description: '', target: 'shared' });
    await act(page, fixture, { type: 'pr_state', prId: id, status: 'review', expectedRevision: 0 });
    return act(page, fixture, { type: 'candidate', prId: id, expectedRevision: 1, resolutions: [] });
  };
  const candidate = await prepare('permission', root, {});
  await act(page, fixture, {
    type: 'thread',
    id: 'thread',
    prId: 'permission',
    candidateId: candidate['candidateId'],
    recordId: null,
    field: null,
    body: 'Restricted discussion',
    required: false,
    mentions: []
  });
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  let generation = 1;
  const grants = async (permissions: string[]) => {
    await act(page, fixture, {
      type: 'member',
      userId: fixture.reviewer.id,
      permissions,
      active: true,
      expectedGeneration: generation++
    });
    await other.getByRole('button', { name: '刷新团队状态', exact: true }).click();
    await openPr(other, 'permission · 待审核');
  };
  await grants(['read']);
  await other.getByRole('tab', { name: '讨论', exact: true }).click();
  for (const label of ['发表评论', '发送回复', '标记已解决', '批准当前候选', '合并到共享数据'])
    await expect(other.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  // 只读：工作区没有「我的任务」与新建任务，也没有成员与权限分区
  await openView(other, '工作区');
  await expect(other.getByRole('button', { name: '新建任务', exact: true })).toHaveCount(0);
  await expect(other.getByRole('tab', { name: /^成员与权限/ })).toHaveCount(0);
  const operations: Record<string, Record<string, unknown>> = {
    edit: { type: 'task', id: 'reviewer-task', name: 'Reviewer task', expectedHead: root },
    comment: { type: 'reply', threadId: 'thread', body: 'Permitted reply', mentions: [] },
    review: {
      type: 'review',
      prId: 'permission',
      candidateId: candidate['candidateId'],
      expectedSource: 'commit-permission',
      stageId: 'review',
      decision: 'approve',
      reason: '',
      expectedRevision: 0
    },
    merge: {
      type: 'merge',
      prId: 'permission',
      candidateId: candidate['candidateId'],
      expectedSource: 'commit-permission',
      expectedTarget: root
    },
    manage: {
      type: 'invite',
      id: 'readonly-invite',
      email: 'reader@example.test',
      permissions: ['read'],
      tokenHash: 'token',
      expiresAt: Date.now() + 60000,
      expectedVersion: 0
    }
  };
  for (const operation of Object.values(operations)) expect((await api(other, fixture, operation)).status).toBe(403);
  expect(
    (
      await api(other, fixture, {
        type: 'thread',
        id: 'forbidden-thread',
        prId: 'permission',
        candidateId: candidate['candidateId'],
        recordId: null,
        field: null,
        body: 'Denied',
        required: false,
        mentions: []
      })
    ).status
  ).toBe(403);
  expect(
    (await api(other, fixture, { type: 'resolve_thread', threadId: 'thread', resolved: true, expectedRevision: 0 }))
      .status
  ).toBe(403);
  /** 每项权限对应的界面入口：按钮与它所在的分区（PR 详情里的讨论页签，或工作区、成员与权限分区）。 */
  const buttons: Record<string, { label: string; where: () => Promise<void> }> = {
    edit: { label: '新建任务', where: () => openView(other, '工作区') },
    comment: { label: '发送回复', where: () => other.getByRole('tab', { name: '讨论', exact: true }).click() },
    review: { label: '批准当前候选', where: async () => undefined },
    manage: { label: '创建邀请链接', where: () => openView(other, '成员与权限') }
  };
  for (const [permission, { label, where }] of Object.entries(buttons)) {
    await grants(['read', permission]);
    await where();
    await expect(other.getByRole('button', { name: label, exact: true })).toBeVisible();
    await act(other, fixture, operations[permission]);
  }
  await grants(['read', 'merge']);
  await other.getByRole('tab', { name: '数据变更', exact: true }).click();
  await expect(other.getByRole('button', { name: '合并到共享数据', exact: true })).toBeVisible();
  expect((await api(other, fixture, operations['merge'])).status).toBe(409);
  await act(page, fixture, { type: 'policy', stages: [], expectedVersion: 1 });
  const current = await state(page, fixture);
  const replacement = await act(page, fixture, {
    type: 'candidate',
    prId: 'permission',
    expectedRevision: current.prs[0].revision,
    resolutions: []
  });
  await act(other, fixture, { ...operations['merge'], candidateId: replacement['candidateId'] });
  await act(page, fixture, {
    type: 'member',
    userId: fixture.reviewer.id,
    permissions: ['read', 'review'],
    active: true,
    expectedGeneration: generation++
  });
  await act(page, fixture, {
    type: 'invite',
    id: 'second',
    email: fixture.secondReviewer.email,
    permissions: ['read', 'review'],
    tokenHash: 'second-token',
    expiresAt: Date.now() + 60000,
    expectedVersion: 0
  });
  const secondContext = await browser.newContext({ baseURL });
  const second = await secondContext.newPage();
  await login(second, fixture.secondReviewer);
  await accept(second, fixture, baseURL, 'second', 'second-token');
  await act(page, fixture, {
    type: 'policy',
    expectedVersion: 2,
    stages: [
      {
        id: 'cost',
        name: '两人会签',
        minimum: 2,
        reviewers: [fixture.reviewer.id, fixture.secondReviewer.id],
        after: []
      },
      { id: 'risk', name: '指定复核', minimum: 1, reviewers: [fixture.secondReviewer.id], after: [] }
    ]
  });
  const before = await state(page, fixture);
  const parallel = await prepare('parallel', before.head, {
    category: { entity: 'AssetCategory', fields: { name: 'permission' } }
  });
  await other.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await openPr(other, 'parallel · 待审核');
  await expect(other.getByLabel('审批阶段', { exact: true }).locator('option')).toHaveText(['两人会签']);
  expect(
    (
      await api(other, fixture, {
        type: 'review',
        prId: 'parallel',
        candidateId: parallel['candidateId'],
        expectedSource: 'commit-parallel',
        stageId: 'risk',
        decision: 'approve',
        reason: '',
        expectedRevision: 0
      })
    ).status
  ).toBe(403);
  await second.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await openPr(second, 'parallel · 待审核');
  await second.getByLabel('审批阶段', { exact: true }).selectOption('risk');
  await second.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(second.getByText('指定复核：1/1 已满足', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(other.getByText('两人会签：1/2 待批准', { exact: true })).toBeVisible();
  const merge = {
    type: 'merge',
    prId: 'parallel',
    candidateId: parallel['candidateId'],
    expectedSource: 'commit-parallel',
    expectedTarget: before.head
  };
  expect((await api(page, fixture, merge)).status).toBe(409);
  await second.getByLabel('审批阶段', { exact: true }).selectOption('cost');
  await second.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(second.getByText('两人会签：2/2 已满足', { exact: true })).toBeVisible();
  await act(page, fixture, merge);
  await act(page, fixture, {
    type: 'member',
    userId: fixture.reviewer.id,
    permissions: [],
    active: false,
    expectedGeneration: generation++
  });
  // 撤权事务里广播撤权事件，被撤权方的页面收到即锁定团队（回到团队列表），刷新按钮随之消失；尚未锁定时再手动刷新。
  // 账号保持登录：顶栏账号菜单还在
  await expect(async () => {
    const refresh = other.getByRole('button', { name: '刷新团队状态', exact: true });
    if (await refresh.isVisible()) await refresh.click({ timeout: 1000 });
    await expect(other.getByRole('heading', { name: '选择团队', exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await expect(other.getByRole('heading', { name: '数据 PR', exact: true })).toHaveCount(0);
  await expect(other.getByRole('button', { name: fixture.name, exact: true })).toHaveCount(0);
  await expect(accountMenu(other)).toContainText(fixture.reviewer.email);
  // 被撤成员的令牌仍在本机，但只读投影按成员资格裁决：什么也读不到
  expect(await rest(other, fixture, `admin_workspaces?${scope(fixture)}&select=*`)).toEqual({ status: 200, body: [] });
  await context.close();
  await secondContext.close();
});

/** 经命令建一个待审核的 PR：任务、一个新增分类的提交（平台交换记录）、PR、请求审核（共享分支还是空的，头就是根）。 */
async function preparePr(page: Page, fixture: Fixture, id: string) {
  const { head } = await state(page, fixture);
  await act(page, fixture, { type: 'task', id, name: id, expectedHead: head });
  const changes = diffRecords(
    {},
    { [`category-${id}`]: { entity: 'AssetCategory', fields: { name: id } } },
    () => 'assets'
  );
  await act(page, fixture, {
    type: 'upload',
    taskId: id,
    expectedHead: head,
    commits: [exchangeCommit(`commit-${id}`, head, fixture.admin.id, id, changes)]
  });
  await act(page, fixture, { type: 'pr', id, taskId: id, title: id, description: '', target: 'shared' });
  await act(page, fixture, { type: 'pr_state', prId: id, status: 'review', expectedRevision: 0 });
}

test('Broadcast 驱动刷新：他人的 PR、成员、讨论与通知不点刷新即出现（ADMIN-US-219）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await openView(page, '数据 PR');
  await expect(page.getByRole('heading', { name: '数据 PR', exact: true })).toBeVisible();
  // 页面打开之后才经命令入口建出的 PR：失效通知（prs 类别）到达即重读团队页
  await preparePr(page, fixture, 'live');
  await expect(page.getByRole('button', { name: 'live · 待审核', exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  // 成员变化（members 类别）：管理者的成员列表出现新成员
  await openView(page, '成员与权限');
  await expect(
    page.locator('section').filter({ has: page.getByRole('heading', { name: '成员与权限', exact: true }) })
  ).toContainText(fixture.reviewer.email);
  await openPr(page, 'live · 待审核');
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  await act(other, fixture, {
    type: 'thread',
    id: 'live-thread',
    prId: 'live',
    candidateId: null,
    recordId: null,
    field: null,
    body: '广播推来的评论',
    required: false,
    mentions: []
  });
  // 讨论（details 类别，点到这个 PR）只重读打开着的 PR 详情；作者订阅了 PR，通知（点名本人）同时到达：通知页签出现未读数
  await expect(page.getByText('广播推来的评论', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '通知 1', exact: true })).toBeVisible();
  await openView(page, '通知');
  await expect(page.getByRole('heading', { name: '通知（1 条未读）', exact: true })).toBeVisible();
  await context.close();
});

test('Presence 显示在线成员与查看位置，离开后消失，不写数据库（ADMIN-US-219）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await preparePr(page, fixture, 'seen');
  const before = (await state(page, fixture)).audit.length;
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  await expect(presence(page)).toContainText(fixture.reviewer.email);
  await openPr(other, 'seen · 待审核');
  // 在线成员面板里，这个成员的那一项显示他正在查看的 PR（显示 PR 标题）
  await expect(presenceOf(page, fixture.reviewer.id)).toContainText('正在查看 PR：seen');
  // 在线状态只在 Realtime 里：没有命令、没有审计、没有任何表的写入（审计里只多了接受邀请一条）
  expect((await state(page, fixture)).audit.length).toBe(before + 1);
  await context.close();
  await expect(presence(page)).not.toContainText(fixture.reviewer.email, { timeout: 20000 });
});

test('撤权：被撤成员立即从在线列表消失并锁定，令牌刷新与重新加入时频道被 Realtime 拒绝（ADMIN-US-219）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  await expect(presence(page)).toContainText(fixture.reviewer.email);
  // 测试进程里同一账号的另一个会话，直接在真栈上订阅团队的私有频道
  const { otp } = (await (
    await request.get(`${fixtures}/__otp?email=${encodeURIComponent(fixture.reviewer.email)}`)
  ).json()) as { otp: string };
  const client = createClient(fixture.supabaseUrl, fixture.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signedIn = await client.auth.verifyOtp({ email: fixture.reviewer.email, token: otp, type: 'email' });
  expect(signedIn.error).toBeNull();
  const subscribedToken = signedIn.data.session!.access_token;
  const topic = `collab:${fixture.teamId}:${fixture.appId}`;
  const statuses: string[] = [];
  client
    .channel(topic, { config: { private: true } })
    .subscribe((status, error) => statuses.push(`${status}:${error?.message ?? ''}`));
  try {
    await expect.poll(() => statuses.join('|'), { timeout: 20000 }).toContain('SUBSCRIBED:');
    await act(page, fixture, {
      type: 'member',
      userId: fixture.reviewer.id,
      permissions: [],
      active: false,
      expectedGeneration: 1
    });
    // 撤权事件：管理者的在线列表立即移除该成员；被撤成员的页面不点刷新即锁定团队、回到团队列表并说明，账号保持登录
    await expect(presence(page)).not.toContainText(fixture.reviewer.email);
    await expect(other.getByText('你已不是这个团队的成员，团队草稿已锁定', { exact: true })).toBeVisible();
    await expect(other.getByRole('heading', { name: '选择团队', exact: true })).toBeVisible();
    await expect(accountMenu(other)).toContainText(fixture.reviewer.email);
    // 令牌刷新：Realtime 按 realtime.messages 的 RLS 重新鉴权，频道被服务端关闭。
    // GoTrue 的访问令牌按秒记 iat、不带 jti：与上一枚同一秒内刷新拿到的是逐字节相同的令牌，supabase-js 与 realtime-js
    // 都当作令牌没变、不推给 Realtime，频道也就不重新鉴权。所以等过上一枚的签发秒再刷新，并确认换到了新令牌
    const issuedAt = (JSON.parse(Buffer.from(subscribedToken.split('.')[1], 'base64url').toString()) as { iat: number })
      .iat;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, (issuedAt + 1) * 1000 - Date.now())));
    const refreshed = await client.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session!.access_token).not.toBe(subscribedToken);
    await expect.poll(() => statuses.join('|'), { timeout: 20000 }).toMatch(/(^|\|)(CLOSED|CHANNEL_ERROR):/);
    // 重新加入：被拒
    const rejoined: string[] = [];
    client
      .channel(topic, { config: { private: true } })
      .subscribe((status, error) => rejoined.push(`${status}:${error?.message ?? ''}`));
    await expect.poll(() => rejoined.join('|'), { timeout: 30000 }).toMatch(/CHANNEL_ERROR:.*permissions/);
    expect(rejoined.some(status => status.startsWith('SUBSCRIBED'))).toBe(false);
  } finally {
    await client.removeAllChannels();
    await context.close();
  }
});

test('Realtime 断开期间页面照常可用，恢复后按修订号补齐变化（ADMIN-US-219 AC#7）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  // 经 Playwright 转发 Realtime 的 WebSocket：断开时关掉现有连接，恢复之前的重连一律立刻关闭
  let blocked = false;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    if (blocked) {
      void ws.close();
      return;
    }
    ws.connectToServer();
    sockets.push(ws);
  });
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await preparePr(page, fixture, 'gap');
  await openPr(page, 'gap · 待审核');
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  await expect(page.locator(`[data-author-id="${fixture.reviewer.id}"]`)).toHaveCount(0);
  // 先等接受邀请的通知处理完（成员列表出现受邀者），之后工作区行的读取只会来自掉线补齐
  await openView(page, '成员与权限');
  await expect(
    page.locator('section').filter({ has: page.getByRole('heading', { name: '成员与权限', exact: true }) })
  ).toContainText(fixture.reviewer.email);
  await openView(page, '数据 PR');
  // 断开：掉线时页面按修订号补齐一次（读一次工作区行），等这次读取结束再让别人发评论
  const caughtUp = page.waitForResponse(response => response.url().includes('/rest/v1/admin_workspaces'));
  blocked = true;
  for (const socket of sockets.splice(0)) await socket.close();
  await expect(page.getByText('实时连接暂不可用，可刷新团队状态', { exact: true })).toBeVisible();
  await caughtUp;
  await act(other, fixture, {
    type: 'thread',
    id: 'gap-thread',
    prId: 'gap',
    candidateId: null,
    recordId: null,
    field: null,
    body: '断线期间的评论',
    required: false,
    mentions: []
  });
  // 断线期间没有通知可收：页面停在断开前的版本，界面照常可用（切换页签不报错）
  const missed = page.getByText('断线期间的评论', { exact: true });
  await page.getByRole('tab', { name: '提交', exact: true }).click();
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  await expect(missed).toHaveCount(0);
  blocked = false;
  // 频道重连成功后按修订号补齐：工作区行的修订号比手里的新，整页重读，漏掉的评论出现，不需要手动刷新
  await expect(missed).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('实时连接暂不可用，可刷新团队状态', { exact: true })).toHaveCount(0);
  await context.close();
});

test('跨设备续作：第二台设备导入同一任务，提交 ID、父链与作者与服务端一致，之后的提交接在原提交之后（ADMIN-US-221 AC#1）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '续作任务');
  await createRecord(page, '资产分类', { 分类名: '设备甲录入' });
  await syncTask(page);
  const synced = await state(page, fixture);
  const task = synced.tasks.find(item => item.name === '续作任务')!;
  expect(await commitOf(page, fixture, task.head)).toEqual({
    parentIds: [synced.root],
    kind: 'normal',
    authorId: fixture.admin.id
  });

  const otherContext = await anotherDevice(browser, page, baseURL);
  const other = await otherContext.newPage();
  await other.goto('/collaboration');
  await selectTeam(other, fixture.name);
  await other.getByRole('button', { name: '打开任务：续作任务', exact: true }).click();
  await expect(other.getByRole('heading', { name: '任务：续作任务', exact: true })).toBeVisible(firstOpenOnNewDevice);
  // 导入的就是服务端那个提交：本机头、远端确认与本机提交历史都是原提交 ID 与原作者；工作树干净，没有记成拉取者的新提交
  const versions = other.locator('[data-local-head]');
  await expect(versions).toHaveAttribute('data-local-head', task.head);
  await expect(versions).toHaveAttribute('data-remote-head', task.head);
  await expect(versions).toContainText('待上传提交：0 · 已保存未提交：无');
  await expect(taskState(other)).toHaveText('已同步：本机与远端确认的版本一致');
  // 提交历史展开后异步渲染：轮询到列表出现为止，比对的内容不变
  await expect.poll(() => localCommits(other)).toEqual([`续作任务 · ${fixture.admin.id} · ${task.head}`]);
  await expectList(other, '资产分类', 'name', ['设备甲录入']);
  // 经下发接口核对：服务端这个任务的交换记录就是本机历史里的那一个
  const download = await rpc(other, fixture, 'admin_commit_exchange', {
    p_team_id: fixture.teamId,
    p_app_id: fixture.appId,
    p_ref: `tasks/${task.id}`,
    p_known: [synced.root],
    p_limit: 100
  });
  expect(download.status, JSON.stringify(download.body)).toBe(200);
  const exchange = download.body as { head: string; commits: CommitExchangeRecordJson[] };
  expect(exchange.commits.map(commit => [commit.commitId, commit.parentIds, commit.authorId])).toEqual([
    [task.head, [synced.root], fixture.admin.id]
  ]);

  await editRecord(other, '资产分类', ['name', '设备甲录入'], { 分类名: ['设备甲录入', '设备乙续作'] });
  await syncTask(other);
  const continued = (await state(page, fixture)).tasks.find(item => item.id === task.id)!;
  expect(continued.head).not.toBe(task.head);
  expect(await commitOf(page, fixture, continued.head)).toEqual({
    parentIds: [task.head],
    kind: 'normal',
    authorId: fixture.admin.id
  });
  await otherContext.close();
});

test('放弃草稿：列表与表单立即回到任务头的数据，不残留已放弃的编辑（ADMIN-US-221 AC#3）', async ({ page, request }) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  await createTask(page, '放弃草稿');
  await createRecord(page, '资产分类', { 分类名: '已提交的分类' });
  await syncTask(page);
  await editRecord(page, '资产分类', ['name', '已提交的分类'], { 分类名: ['已提交的分类', '放弃前的改名'] });
  await createRecord(page, '资产分类', { 分类名: '放弃前的新分类' });
  await expectList(page, '资产分类', 'name', ['放弃前的改名', '放弃前的新分类']);
  await expect(taskState(page)).toHaveText('有已保存未提交的改动（2 项）');
  await page.getByRole('button', { name: '放弃草稿', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认放弃', exact: true }).click();
  await expect(page.getByText('已放弃草稿，任务回到上次提交的版本', { exact: true })).toBeVisible();
  // 不刷新、不重开任务：列表与表单立即读到任务头的数据
  await expectList(page, '资产分类', 'name', ['已提交的分类']);
  expect(await recordValue(page, '资产分类', ['name', '已提交的分类'], '分类名')).toBe('已提交的分类');
  await expect(taskState(page)).toHaveText('已同步：本机与远端确认的版本一致');
  await page.reload();
  await selectTeam(page, fixture.name);
  await page.getByRole('button', { name: '打开任务：放弃草稿', exact: true }).click();
  await expectList(page, '资产分类', 'name', ['已提交的分类']);
  await expect(page.getByText(/待上传提交：0 · 已保存未提交：无/)).toBeVisible();
});

test('恢复历史版本：形成未提交改动，同步、审批后合并，共享头只前进、历史保留（ADMIN-US-221 AC#5、ADMIN-US-213）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture`)).json()) as Fixture;
  await login(page, fixture.admin);
  await selectTeam(page, fixture.name);
  // 先免审批合出两个共享版本，再恢复成第一个版本的数据并走审批
  await act(page, fixture, { type: 'policy', stages: [], expectedVersion: 1 });
  /** 在当前任务上同步、建 PR、请求审核、生成候选并合并（免审批）。 */
  const syncAndMerge = async (title: string) => {
    await syncTask(page);
    await createPr(page);
    await page.getByRole('button', { name: '请求审核', exact: true }).click();
    await expect(page.getByRole('button', { name: `${title} · 待审核`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
    await expect(page.getByText('未解决冲突：0 · 检查错误：0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
    await expect(page.getByRole('button', { name: `${title} · 已合并`, exact: true })).toBeVisible();
  };
  await createTask(page, '第一版');
  await createRecord(page, '资产分类', { 分类名: '第一版名称' });
  await syncAndMerge('第一版');
  const first = (await state(page, fixture)).head;
  await createTask(page, '第二版');
  await editRecord(page, '资产分类', ['name', '第一版名称'], { 分类名: ['第一版名称', '第二版名称'] });
  await syncAndMerge('第二版');
  const second = await state(page, fixture);
  await act(page, fixture, {
    type: 'policy',
    stages: [{ id: 'review', name: '审核', minimum: 1, reviewers: [], after: [] }],
    expectedVersion: 2
  });
  // 历史与审计里第一次合并的那个版本（界面上显示短 ID，完整 ID 在 data 属性里）：从它创建恢复草稿
  await openView(page, '历史与审计');
  const version = page.locator(`details[data-commit-id="${first}"]`);
  await version.locator(':scope > summary').click();
  await version.getByRole('button', { name: '从此版本创建恢复草稿', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^任务：恢复 Merge 第一版/ })).toBeVisible();
  await expectList(page, '资产分类', 'name', ['第一版名称']);
  await expect(taskState(page)).toHaveText('有已保存未提交的改动（1 项）');
  await expect(page.getByText('工作树来自历史版本的恢复，同步后形成新的提交', { exact: true })).toBeVisible();
  // 恢复只改了任务的工作树：共享头没动
  expect((await state(page, fixture)).head).toBe(second.head);
  await syncTask(page);
  const restoreTask = (await state(page, fixture)).tasks.find(task => task.name.startsWith('恢复 Merge 第一版'))!;
  expect(await commitOf(page, fixture, restoreTask.head)).toEqual({
    parentIds: [second.head],
    kind: 'normal',
    authorId: fixture.admin.id
  });
  await createPr(page);
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: /^恢复 Merge 第一版.* · 待审核$/ })).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await expect(page.getByText('未解决冲突：0 · 检查错误：0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('缺少当前候选的有效批准', { exact: true })).toBeVisible();
  const reviewContext = await browser.newContext({ baseURL });
  const reviewer = await reviewContext.newPage();
  await login(reviewer, fixture.reviewer);
  await accept(reviewer, fixture, baseURL);
  await openPr(reviewer, /^恢复 Merge 第一版.* · 待审核$/);
  await reviewer.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(reviewer.getByText('审核：1/1 已满足', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: /^恢复 Merge 第一版.* · 已合并$/ })).toBeVisible();
  const merged = await state(page, fixture);
  await openView(page, '工作区');
  const shared = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: `共享数据 · ${fixture.name}`, exact: true }) })
    .first();
  await expect(shared).toContainText('第一版名称');
  await expect(shared).not.toContainText('第二版名称');
  // 共享头只前进：新的合并提交以上一个共享头为第一父，两个旧版本的合并都还在历史里
  expect((await commitOf(page, fixture, merged.head)).parentIds).toEqual([second.head, restoreTask.head]);
  const history = await rpc(page, fixture, 'admin_commit_exchange', {
    p_team_id: fixture.teamId,
    p_app_id: fixture.appId,
    p_ref: 'shared',
    p_known: [],
    p_limit: 100
  });
  const ids = (history.body as { commits: CommitExchangeRecordJson[] }).commits.map(commit => commit.commitId);
  expect(ids).toEqual(expect.arrayContaining([first, second.head, merged.head]));
  await reviewContext.close();
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type WebSocketRoute } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { diffRecords } from '../src/changes.js';
import { sealCommit } from '../src/commit.js';
import type { Audit, Records } from '../src/model.js';
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
async function login(page: Page, account: Account) {
  await page.goto('/collaboration');
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('验证码', { exact: true }).fill(account.otp);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
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
async function rows<T>(page: Page, fixture: Fixture, path: string): Promise<T[]> {
  const response = await rest(page, fixture, path);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as T[];
}
const scope = (workspace: { teamId: string; appId: string }) =>
  `team_id=eq.${workspace.teamId}&app_id=eq.${workspace.appId}`;
/** 断言用的工作区状态：经只读投影读出的共享头、策略、任务、PR、审核、候选与全部审计（时间正序）。 */
async function state(page: Page, fixture: Fixture, workspace: { teamId: string; appId: string } = fixture) {
  const where = scope(workspace);
  const [row] = await rows<{ head: string | null; policy_version: number }>(
    page,
    fixture,
    `admin_workspaces?${where}&select=head,policy_version`
  );
  const tasks = await rows<{ id: string; name: string; origin_task_id: string | null; head: string | null }>(
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
    policy: { version: row.policy_version },
    tasks: tasks.map(task => ({ id: task.id, name: task.name, originTaskId: task.origin_task_id, head: task.head })),
    prs: prs.map(pr => ({ id: pr.id, taskId: pr.task_id, title: pr.title, revision: pr.revision, candidateId: pr.candidate_id })),
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
/** 读取一个提交的元数据：经只读投影 `admin_commits`。 */
async function commitOf(page: Page, fixture: Fixture, id: string) {
  const [row] = await rows<{ parent_id: string | null; author_id: string }>(
    page,
    fixture,
    `admin_commits?${scope(fixture)}&id=eq.${encodeURIComponent(id)}&select=parent_id,author_id`
  );
  expect(row, `commit ${id}`).toBeDefined();
  return { parent: row.parent_id, authorId: row.author_id };
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
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('采购电脑');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('电脑');
  await page.getByRole('button', { name: '新增资产', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).nth(1).fill('工作站');
  await page.getByLabel('购入价', { exact: true }).fill('120');
  await page.getByLabel('分类', { exact: true }).selectOption({ label: '电脑' });
  await page.getByRole('button', { name: '新增维护记录', exact: true }).click();
  await page.getByLabel('事项', { exact: true }).fill('安装系统');
  await page.getByLabel('日期', { exact: true }).fill('2026-11-16');
  await page.getByLabel('所属资产', { exact: true }).selectOption({ label: '工作站' });
  expect((await new AxeBuilder({ page }).include('.collaboration').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '取消同步', exact: true }).click();
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '打开任务：采购电脑', exact: true }).click();
  await expect(page.getByLabel('购入价', { exact: true })).toHaveValue('120');
  await page.context().setOffline(true);
  await page.getByLabel('购入价', { exact: true }).fill('130');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('已形成提交，联网验证后可同步', { exact: true })).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await fillSettled(page.getByLabel('PR 说明', { exact: true }), '整单采购与安装');
  await expect(page.getByLabel('目标分支', { exact: true })).toHaveValue('shared');
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '采购电脑 · review', exact: true })).toBeVisible();
  await expect(page.getByText('整单采购与安装', { exact: true })).toBeVisible();
  const reviewContext = await browser.newContext({ baseURL });
  const reviewPage = await reviewContext.newPage();
  await login(reviewPage, fixture.reviewer);
  await reviewPage.getByText('接受团队邀请', { exact: true }).click();
  await reviewPage.getByLabel('邀请链接', { exact: true }).fill(invitationLink(baseURL, fixture));
  await reviewPage.getByRole('button', { name: '接受邀请', exact: true }).click();
  await reviewPage.getByRole('button', { name: '采购电脑 · review', exact: true }).click();
  await expect(reviewPage.getByRole('button', { name: '批准当前候选', exact: true })).toBeDisabled();
  await fillSettled(reviewPage.getByLabel('审核或撤销理由', { exact: true }), '请先确认采购范围');
  await reviewPage.getByRole('button', { name: '要求修改', exact: true }).click();
  await expect(
    reviewPage.getByText(`要求修改：${fixture.reviewer.id} — 请先确认采购范围`, { exact: true })
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
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '采购电脑 · review', exact: true }).click();
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  await fillSettled(page.getByLabel('新评论', { exact: true }), '请核对整单采购');
  await page.getByLabel('必须处理', { exact: true }).check();
  await page.getByLabel('提及成员', { exact: true }).selectOption(fixture.reviewer.id);
  await page.getByRole('button', { name: '发表评论', exact: true }).click();
  await expect(page.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '数据变更', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('必须处理的讨论尚未解决', { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await reviewPage
    .getByRole('heading', { name: /通知（/ })
    .locator('..')
    .getByRole('button')
    .filter({ hasText: '采购电脑' })
    .last()
    .click();
  await expect(reviewPage.getByRole('tab', { name: '讨论', exact: true })).toHaveAttribute('aria-selected', 'true');
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('required');
  await expect(reviewPage.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toBeVisible();
  for (const filter of ['open', 'current']) {
    await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption(filter);
    await expect(reviewPage.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toBeVisible();
  }
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('mine');
  await expect(reviewPage.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toHaveCount(0);
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('all');
  await fillSettled(reviewPage.getByLabel('回复', { exact: true }), '已核对采购范围');
  await reviewPage.getByRole('button', { name: '发送回复', exact: true }).click();
  await expect(reviewPage.getByText(`${fixture.reviewer.id}：已核对采购范围`, { exact: true })).toBeVisible();
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('mine');
  await reviewPage.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(reviewPage.getByRole('button', { name: '重新打开讨论', exact: true })).toBeVisible();
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('open');
  await expect(reviewPage.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toHaveCount(0);
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('current');
  await expect(reviewPage.getByRole('button', { name: '重新打开讨论', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '采购电脑 · merged', exact: true })).toBeVisible();
  const shared = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: `共享数据 · ${fixture.name}`, exact: true }) })
    .first();
  await expect(shared).toContainText('工作站');
  await expect(shared).toContainText('130');
  await expect(shared).toContainText('安装系统');
  const restore = page
    .locator('details')
    .filter({ has: page.getByRole('button', { name: '从此版本创建恢复草稿', exact: true, includeHidden: true }) })
    .last();
  await restore.locator(':scope > summary').click();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await expect(restore).toHaveAttribute('open', '');
  await restore.getByRole('button', { name: '从此版本创建恢复草稿', exact: true }).click();
  await expect(page.getByRole('heading', { name: /任务：恢复 / })).toBeVisible();
  await expect(page.getByLabel('购入价', { exact: true })).toHaveValue('130');
  await expect(page.getByText(/待上传提交：0 · 已保存未提交：/)).toBeVisible();
  await expect(shared).toContainText('130');
  const firstHistory = await state(page, fixture);
  await page.getByLabel('购入价', { exact: true }).fill('125');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: /^恢复 .* · review$/ })).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('缺少当前候选的有效批准', { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await reviewPage.getByRole('button', { name: /^恢复 .* · review$/ }).click();
  await reviewPage.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(reviewPage.getByText('审核：1/1 已满足', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: /^恢复 .* · merged$/ })).toBeVisible();
  const finalHistory = await state(page, fixture);
  const otherHistory = await state(reviewPage, fixture);
  expect(otherHistory.head).toBe(finalHistory.head);
  expect(otherHistory.audit).toEqual(finalHistory.audit);
  expect(finalHistory.head).not.toBe(firstHistory.head);
  expect((await commitOf(page, fixture, finalHistory.head!)).parent).toBe(firstHistory.head);
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
  await page.getByLabel('任务名称', { exact: true }).fill('级联删除预览');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：级联删除预览', exact: true })).toBeVisible();
  await expect(page.locator('.collaboration')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '删除（含关联记录）', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '级联删除预览 · review', exact: true })).toBeVisible();
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

test('离线冷启动只恢复有效授权上下文；过期和退出会锁定保留的草稿', async ({ page, request }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('离线保留');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('离线机密草稿');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await expect(page.locator('.collaboration')).toHaveAttribute('data-offline-ready', 'true');
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '离线任务：离线保留', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('离线机密草稿');
  await page.evaluate(() => {
    const key = 'admin-collaboration-grant:/collaboration-api';
    const grant = JSON.parse(localStorage.getItem(key)!);
    grant.expiresAt = 1;
    localStorage.setItem(key, JSON.stringify(grant));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(page.getByText('离线机密草稿', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
  await page.context().setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '打开任务：离线保留', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('离线机密草稿');
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  const contexts = await page.evaluate(() => indexedDB.databases());
  expect(contexts.some(database => database.name?.includes('rxdb-admin-collaboration-v1:['))).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(page.getByText('离线机密草稿', { exact: true })).toHaveCount(0);
});

test('错误账号不能消费邀请；验证码不可重复登录', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
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
  await other.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(other.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await other.getByLabel('邮箱', { exact: true }).fill(fixture.reviewer.email);
  await other.getByLabel('验证码', { exact: true }).fill(fixture.reviewer.otp);
  await other.getByRole('button', { name: '登录', exact: true }).click();
  await expect(other.getByRole('button', { name: '退出账号' })).toHaveCount(0);
  await expect(other.getByRole('status').filter({ hasText: /expired|invalid|过期|无效/i })).toBeVisible();
  await context.close();
});

test('匿名资产只在预览确认后复制到任务，原库与共享分支均保持原样', async ({ page, request }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await page.goto('/entities/assets/AssetCategory');
  await page.getByRole('button', { name: '+ 新增', exact: true }).click();
  await page.getByRole('group', { name: '分类名' }).getByRole('textbox').fill('匿名保留分类');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：导入本机资产', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '预览匿名数据导入', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 条本机记录');
  await expect(page.getByRole('dialog')).toContainText('匿名保留分类');
  await page.getByRole('button', { name: '确认复制到新任务', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('匿名保留分类');
  await expect(page.getByText('共享版本：空分支 · 默认只读', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '匿名本机工作台', exact: true }).click();
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
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('语言草稿');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('保存全部');
  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(
    page.locator('.collaboration').getByRole('heading', { name: 'Team collaboration', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('保存全部');
  await expect(page.getByText('Unsaved inputs', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save all', exact: true }).click();
  await expect(page.getByText('Saved locally; not synced yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(page.getByText('Current commits synced; later edits still need syncing', { exact: true })).toBeVisible();
  await page.getByLabel('PR title', { exact: true }).fill('保存全部');
  await page.getByRole('button', { name: 'Create PR', exact: true }).click();
  await expect(page.getByRole('heading', { name: '保存全部', exact: true })).toBeVisible();
  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: /简体中文/ }).click();
  await expect(page.getByRole('button', { name: '保存全部', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('保存全部');
});

test('跨设备分叉另存后可恢复原任务远端，两个版本均保留', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('双设备任务');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('共同起点');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  const otherContext = await browser.newContext({ baseURL, storageState: await page.context().storageState() });
  const other = await otherContext.newPage();
  await other.goto('/collaboration');
  await other.getByRole('button', { name: fixture.name, exact: true }).click();
  await other.getByRole('button', { name: '打开任务：双设备任务', exact: true }).click();
  await other.getByRole('textbox', { name: '名称', exact: true }).fill('设备乙版本');
  await other.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(other.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: '同步', exact: true }).click();
  await expect(other.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('设备甲版本');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByRole('button', { name: '拉取远端版本', exact: true })).toBeVisible();
  await page.getByLabel('另存任务名称', { exact: true }).fill('保留设备甲');
  await page.getByRole('button', { name: '另存为新任务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：保留设备甲', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备甲版本');
  await page.getByRole('button', { name: '打开任务：双设备任务', exact: true }).click();
  await page.getByRole('button', { name: '拉取远端版本', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备乙版本');
  await page.getByRole('button', { name: '打开任务：保留设备甲', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备甲版本');
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await expect(page.getByRole('button', { name: '保留设备甲 · draft', exact: true })).toBeVisible();
  const forked = await state(page, fixture);
  const forkTask = forked.tasks.find(task => task.name === '保留设备甲')!;
  const originalTask = forked.tasks.find(task => task.name === '双设备任务')!;
  expect(forkTask.originTaskId).toBe(originalTask.id);
  expect(forked.prs.find(pr => pr.title === '保留设备甲')?.taskId).toBe(forkTask.id);
  expect((await commitOf(page, fixture, forkTask.head!)).authorId).toBe(fixture.admin.id);
  expect(forkTask.head).not.toBe(originalTask.head);
  await otherContext.close();
});

test('两阶段审批、在线成员和越权合并拒绝', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '添加审批阶段', exact: true }).click();
  await page.getByLabel('阶段名称', { exact: true }).nth(1).fill('财务复核');
  await page.getByLabel('等待前面所有阶段', { exact: true }).nth(1).check();
  await page.getByRole('button', { name: '保存审批策略', exact: true }).click();
  await expect(page.getByRole('heading', { name: '审批策略 v2', exact: true })).toBeVisible();
  await page.getByLabel('任务名称', { exact: true }).fill('分级采购');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('已核对分类');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '分级采购 · review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await expect(page.getByText('财务复核：0/1 待批准', { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await other.getByText('接受团队邀请', { exact: true }).click();
  await other.getByLabel('邀请链接', { exact: true }).fill(invitationLink(baseURL, fixture));
  await other.getByRole('button', { name: '接受邀请', exact: true }).click();
  await other.getByRole('button', { name: '分级采购 · review', exact: true }).click();
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
        return page.getByText(/在线成员：/).textContent();
      },
      { timeout: 20000, intervals: [1000] }
    )
    .toContain(fixture.reviewer.email);
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '分级采购 · merged', exact: true })).toBeVisible();
  await context.close();
});

test('双团队切换保留本机任务并隔离查询、通知与在线成员', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('甲团队草稿');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('仅甲团队可见');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: fixture.secondary.name, exact: true }).click();
  await expect(page.getByRole('button', { name: '打开任务：甲团队草稿', exact: true })).toHaveCount(0);
  await page.getByLabel('任务名称', { exact: true }).fill('乙团队任务');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('仅乙团队可见');
  await page.getByRole('button', { name: '保存全部', exact: true }).click();
  await expect(page.getByText('已保存到本机，尚未同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '打开任务：甲团队草稿', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('仅甲团队可见');
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
  await expect(page.getByText(/在线成员：/)).toContainText(fixture.reviewer.email);
  await page.getByRole('button', { name: fixture.secondary.name, exact: true }).click();
  await expect(page.getByText(/在线成员：/)).not.toContainText(fixture.reviewer.email);
  await page.getByRole('button', { name: '打开任务：乙团队任务', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('仅乙团队可见');
  expect((await state(page, fixture)).tasks.map(task => task.name)).toEqual(['甲团队草稿']);
  expect((await state(page, fixture, fixture.secondary)).tasks.map(task => task.name)).toEqual(['乙团队任务']);
  await context.close();
});

test('六项权限独立生效，指定审核人与并行人数门槛不能绕过', async ({ page, request, browser, baseURL }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  /** 以 `current`（共享头 `head` 时的记录）为起点，提交一份把分类改名为 `id` 的字段级变更，并带上内容指纹。 */
  const prepare = async (id: string, head: string | null, current: Records) => {
    await act(page, fixture, { type: 'task', id, name: id, expectedHead: head });
    await act(page, fixture, {
      type: 'upload',
      taskId: id,
      expectedHead: head,
      commits: [
        await sealCommit({
          id: `commit-${id}`,
          parent: head,
          authorId: fixture.admin.id,
          message: id,
          changes: diffRecords(current, { category: { entity: 'AssetCategory', fields: { name: id } } }, () => 'assets')
        })
      ]
    });
    await act(page, fixture, { type: 'pr', id, taskId: id, title: id, description: '', target: 'shared' });
    await act(page, fixture, { type: 'pr_state', prId: id, status: 'review', expectedRevision: 0 });
    return act(page, fixture, { type: 'candidate', prId: id, expectedRevision: 1, resolutions: [] });
  };
  const candidate = await prepare('permission', null, {});
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
    await other.getByRole('button', { name: 'permission · review', exact: true }).click();
  };
  await grants(['read']);
  await other.getByRole('tab', { name: '讨论', exact: true }).click();
  for (const label of [
    '开始修改',
    '发表评论',
    '发送回复',
    '标记已解决',
    '批准当前候选',
    '合并到共享数据',
    '创建邀请链接'
  ])
    await expect(other.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  const operations: Record<string, Record<string, unknown>> = {
    edit: { type: 'task', id: 'reviewer-task', name: 'Reviewer task', expectedHead: null },
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
      expectedTarget: null
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
  const buttons = { edit: '开始修改', comment: '发送回复', review: '批准当前候选', manage: '创建邀请链接' };
  for (const [permission, label] of Object.entries(buttons)) {
    await grants(['read', permission]);
    if (permission === 'comment') await other.getByRole('tab', { name: '讨论', exact: true }).click();
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
  await other.getByRole('button', { name: 'parallel · review', exact: true }).click();
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
  await second.getByRole('button', { name: 'parallel · review', exact: true }).click();
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
  // 撤权事务里广播撤权事件，被撤权方的页面收到即锁定，刷新按钮随之消失；尚未锁定时再手动刷新
  await expect(async () => {
    const refresh = other.getByRole('button', { name: '刷新团队状态', exact: true });
    if (await refresh.isVisible()) await refresh.click({ timeout: 1000 });
    await expect(other.getByRole('button', { name: '退出账号', exact: true })).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await expect(other.getByRole('heading', { name: '数据 PR', exact: true })).toHaveCount(0);
  // 被撤成员的令牌仍在本机，但只读投影按成员资格裁决：什么也读不到
  expect(await rest(other, fixture, `admin_workspaces?${scope(fixture)}&select=*`)).toEqual({ status: 200, body: [] });
  await context.close();
  await secondContext.close();
});

/** 经命令建一个待审核的 PR：任务、一个新增分类的提交、PR、请求审核（共享分支为空时）。 */
async function preparePr(page: Page, fixture: Fixture, id: string) {
  await act(page, fixture, { type: 'task', id, name: id, expectedHead: null });
  await act(page, fixture, {
    type: 'upload',
    taskId: id,
    expectedHead: null,
    commits: [
      await sealCommit({
        id: `commit-${id}`,
        parent: null,
        authorId: fixture.admin.id,
        message: id,
        changes: diffRecords({}, { [`category-${id}`]: { entity: 'AssetCategory', fields: { name: id } } }, () => 'assets')
      })
    ]
  });
  await act(page, fixture, { type: 'pr', id, taskId: id, title: id, description: '', target: 'shared' });
  await act(page, fixture, { type: 'pr_state', prId: id, status: 'review', expectedRevision: 0 });
}
const online = (page: Page) => page.getByText(/在线成员：/);

test('Broadcast 驱动刷新：他人的 PR、成员、讨论与通知不点刷新即出现（ADMIN-US-219）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: '数据 PR', exact: true })).toBeVisible();
  // 页面打开之后才经命令入口建出的 PR：失效通知（prs 类别）到达即重读团队页
  await preparePr(page, fixture, 'live');
  await expect(page.getByRole('button', { name: 'live · review', exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  // 成员变化（members 类别）：管理者的成员列表出现新成员
  await expect(
    page.locator('section').filter({ has: page.getByRole('heading', { name: '成员与权限', exact: true }) })
  ).toContainText(fixture.reviewer.email);
  await page.getByRole('button', { name: 'live · review', exact: true }).click();
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
  // 讨论（details 类别，点到这个 PR）只重读打开着的 PR 详情；作者订阅了 PR，通知（点名本人）同时到达
  await expect(page.getByText(`${fixture.reviewer.id}：广播推来的评论`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '通知（1 条未读）', exact: true })).toBeVisible();
  await context.close();
});

test('Presence 显示在线成员与查看位置，离开后消失，不写数据库（ADMIN-US-219）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await preparePr(page, fixture, 'seen');
  const before = (await state(page, fixture)).audit.length;
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  await expect(online(page)).toContainText(fixture.reviewer.email);
  await other.getByRole('button', { name: 'seen · review', exact: true }).click();
  await expect(online(page)).toContainText(`${fixture.reviewer.email}（PR seen）`);
  // 在线状态只在 Realtime 里：没有命令、没有审计、没有任何表的写入（审计里只多了接受邀请一条）
  expect((await state(page, fixture)).audit.length).toBe(before + 1);
  await context.close();
  await expect(online(page)).not.toContainText(fixture.reviewer.email, { timeout: 20000 });
});

test('撤权：被撤成员立即从在线列表消失并锁定，令牌刷新与重新加入时频道被 Realtime 拒绝（ADMIN-US-219）', async ({
  page,
  request,
  browser,
  baseURL
}) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
  await login(page, fixture.admin);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  await expect(online(page)).toContainText(fixture.reviewer.email);
  // 测试进程里同一账号的另一个会话，直接在真栈上订阅团队的私有频道
  const { otp } = (await (
    await request.get(`http://127.0.0.1:8309/__otp?email=${encodeURIComponent(fixture.reviewer.email)}`)
  ).json()) as { otp: string };
  const client = createClient(fixture.supabaseUrl, fixture.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signedIn = await client.auth.verifyOtp({ email: fixture.reviewer.email, token: otp, type: 'email' });
  expect(signedIn.error).toBeNull();
  const topic = `collab:${fixture.teamId}:${fixture.appId}`;
  const statuses: string[] = [];
  client.channel(topic, { config: { private: true } }).subscribe(status => statuses.push(status));
  try {
    await expect.poll(() => statuses, { timeout: 20000 }).toContain('SUBSCRIBED');
    await act(page, fixture, {
      type: 'member',
      userId: fixture.reviewer.id,
      permissions: [],
      active: false,
      expectedGeneration: 1
    });
    // 撤权事件：管理者的在线列表立即移除该成员；被撤成员的页面不点刷新即锁定
    await expect(online(page)).not.toContainText(fixture.reviewer.email);
    await expect(other.getByRole('button', { name: '登录', exact: true })).toBeVisible();
    await expect(other.getByRole('button', { name: '退出账号', exact: true })).toHaveCount(0);
    // 令牌刷新：Realtime 按 realtime.messages 的 RLS 重新鉴权，频道被服务端关闭
    const refreshed = await client.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    await expect
      .poll(() => statuses.some(status => status === 'CLOSED' || status === 'CHANNEL_ERROR'), { timeout: 20000 })
      .toBe(true);
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
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as Fixture;
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
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await preparePr(page, fixture, 'gap');
  await page.getByRole('button', { name: 'gap · review', exact: true }).click();
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await accept(other, fixture, baseURL);
  await expect(page.getByText(`${fixture.reviewer.id}：`)).toHaveCount(0);
  // 先等接受邀请的通知处理完（成员列表出现受邀者），之后工作区行的读取只会来自掉线补齐
  await expect(
    page.locator('section').filter({ has: page.getByRole('heading', { name: '成员与权限', exact: true }) })
  ).toContainText(fixture.reviewer.email);
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
  const missed = page.getByText(`${fixture.reviewer.id}：断线期间的评论`, { exact: true });
  await page.getByRole('tab', { name: '提交', exact: true }).click();
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  await expect(missed).toHaveCount(0);
  blocked = false;
  // 频道重连成功后按修订号补齐：工作区行的修订号比手里的新，整页重读，漏掉的评论出现，不需要手动刷新
  await expect(missed).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('实时连接暂不可用，可刷新团队状态', { exact: true })).toHaveCount(0);
  await context.close();
});

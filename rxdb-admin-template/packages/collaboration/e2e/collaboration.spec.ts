import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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
  invitation: string;
  token: string;
}
async function login(page: Page, account: Account) {
  await page.goto('/collaboration');
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('验证码', { exact: true }).fill(account.otp);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
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
  await page.getByLabel('PR 说明', { exact: true }).fill('整单采购与安装');
  await expect(page.getByLabel('目标分支', { exact: true })).toHaveValue('shared');
  await page.getByRole('button', { name: '创建 PR', exact: true }).click();
  await page.getByRole('button', { name: '请求审核', exact: true }).click();
  await expect(page.getByRole('button', { name: '采购电脑 · review', exact: true })).toBeVisible();
  await expect(page.getByText('整单采购与安装', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '生成合并候选并检查', exact: true }).click();
  await expect(page.getByText('未解决冲突：0 · 检查错误：0', { exact: true })).toBeVisible();
  for (const tab of ['讨论', '提交', '检查', '数据变更']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: tab, exact: true })).toBeVisible();
  }

  const reviewContext = await browser.newContext({ baseURL });
  const reviewPage = await reviewContext.newPage();
  await login(reviewPage, fixture.reviewer);
  await reviewPage.getByText('接受团队邀请', { exact: true }).click();
  const link = new URL('/collaboration', baseURL);
  link.searchParams.set(
    'join',
    JSON.stringify({ teamId: fixture.teamId, appId: fixture.appId, id: fixture.invitation, token: fixture.token })
  );
  await reviewPage.getByLabel('邀请链接', { exact: true }).fill(link.toString());
  await reviewPage.getByRole('button', { name: '接受邀请', exact: true }).click();
  await reviewPage.getByRole('button', { name: '采购电脑 · review', exact: true }).click();
  await reviewPage.getByRole('button', { name: '批准当前候选', exact: true }).click();
  await expect(reviewPage.getByText('审核：1/1 已满足', { exact: true })).toBeVisible();
  await expect(reviewPage.getByRole('button', { name: '合并到共享数据', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '采购电脑 · review', exact: true }).click();
  await page.getByRole('tab', { name: '讨论', exact: true }).click();
  await page.getByLabel('新评论', { exact: true }).fill('请核对整单采购');
  await page.getByLabel('必须处理', { exact: true }).check();
  await page.getByLabel('提及成员', { exact: true }).selectOption(fixture.reviewer.id);
  await page.getByRole('button', { name: '发表评论', exact: true }).click();
  await expect(page.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '数据变更', exact: true }).click();
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByText('必须处理的讨论尚未解决', { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '刷新团队状态', exact: true }).click();
  await reviewPage.getByRole('heading', { name: /通知（/ }).locator('..').getByRole('button').filter({ hasText: '采购电脑' }).last().click();
  await expect(reviewPage.getByRole('tab', { name: '讨论', exact: true })).toHaveAttribute('aria-selected', 'true');
  await reviewPage.getByLabel('讨论筛选', { exact: true }).selectOption('required');
  await expect(reviewPage.getByText(`${fixture.admin.id}：请核对整单采购`, { exact: true })).toBeVisible();
  await reviewPage.getByRole('button', { name: '标记已解决', exact: true }).click();
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
  const restore = page.locator('details').filter({ has: page.getByRole('button', { name: '从此版本创建恢复草稿', exact: true, includeHidden: true }) }).last();
  await restore.locator(':scope > summary').click();
  await restore.getByRole('button', { name: '从此版本创建恢复草稿', exact: true }).click();
  await expect(page.getByRole('heading', { name: /任务：恢复 / })).toBeVisible();
  await expect(page.getByLabel('购入价', { exact: true })).toHaveValue('130');
  await expect(page.getByText(/待上传提交：0 · 已保存未提交：/)).toBeVisible();
  await expect(shared).toContainText('130');
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
  const link = new URL('/collaboration', baseURL);
  link.searchParams.set(
    'join',
    JSON.stringify({ teamId: fixture.teamId, appId: fixture.appId, id: fixture.invitation, token: fixture.token })
  );
  await page.getByLabel('邀请链接', { exact: true }).fill(link.toString());
  await page.getByRole('button', { name: '接受邀请', exact: true }).click();
  await expect(page.getByText('邀请无效或登录邮箱不匹配，请切换账号', { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await login(other, fixture.reviewer);
  await other.getByText('接受团队邀请', { exact: true }).click();
  await other.getByLabel('邀请链接', { exact: true }).fill(link.toString());
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
  await expect(page.locator('.collaboration').getByRole('heading', { name: 'Team collaboration', exact: true })).toBeVisible();
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
  const context = await browser.newContext({ baseURL }); const other = await context.newPage();
  await login(other, fixture.reviewer);
  await other.getByText('接受团队邀请', { exact: true }).click();
  const link = new URL('/collaboration', baseURL);
  link.searchParams.set('join', JSON.stringify({ teamId: fixture.teamId, appId: fixture.appId, id: fixture.invitation, token: fixture.token }));
  await other.getByLabel('邀请链接', { exact: true }).fill(link.toString());
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
  await expect.poll(async () => {
    await page.getByRole('button', { name: '刷新团队状态', exact: true }).click();
    return page.getByText(/在线成员：/).textContent();
  }, { timeout: 20000, intervals: [1000] }).toContain(fixture.reviewer.email);
  await page.getByRole('button', { name: '合并到共享数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '分级采购 · merged', exact: true })).toBeVisible();
  await context.close();
});

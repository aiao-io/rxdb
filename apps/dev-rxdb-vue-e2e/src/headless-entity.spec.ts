import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';
import { callSearchApi, waitForSearchApi } from './search-test-api.js';

/**
 * Headless 实体能力的三端对拍（US-403 阶段 D）：`/headless` 页只经 `@aiao/rxdb-model/headless` 与各框架的
 * `/headless` 绑定取状态和动作，表单、筛选、列表、详情与弹窗的 DOM、控件和样式都是页面自己的，不渲染默认组件。
 * 每个用例都在全新数据库里经真实浏览器操作，落库结果以刷新后读回为准。
 *
 * 本文件与 dev-rxdb-angular-e2e / dev-rxdb-vue-e2e 的副本内容一致，只允许一处差异：
 * Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），React / Vue 从
 * `@playwright/test` 取。三端 DOM 契约（标签、角色、data-testid）同构，改一处改三处。
 */

/** 列表每页条数（与页面的 PAGE_SIZE 一致）。 */
const PAGE_SIZE = 3;

/** 种子文章：标题升序即库内默认序，浏览量决定数值筛选的命中集。 */
const SEEDS = [
  { title: 'hl-alpha', category: 'tech', viewCount: 10 },
  { title: 'hl-bravo', category: 'life', viewCount: 20 },
  { title: 'hl-charlie', category: 'tech', viewCount: 30 },
  { title: 'hl-delta', category: 'travel', viewCount: 40 },
  { title: 'hl-echo', category: 'life', viewCount: 50 }
] as const;

/** 一篇合法的新文章（表单与弹窗共用）。 */
const VALID_ARTICLE = {
  title: 'hl-form-article',
  body: 'written through a headless form',
  category: 'tech',
  tags: 'x, y',
  authorId: 'e2e-author',
  viewCount: '12'
} as const;

/** 只填必填字段：没碰的可选字段必须沿用实体默认值（如 viewCount 的 0），而不是被表单基线的 null 覆盖。 */
const REQUIRED_ONLY = {
  title: VALID_ARTICLE.title,
  body: VALID_ARTICLE.body,
  category: VALID_ARTICLE.category,
  authorId: VALID_ARTICLE.authorId
} as const;

/** 收集页面级错误与 console.error；用例收尾断言为空。 */
const watchPage = (page: Page): string[] => {
  const problems: string[] = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  return problems;
};

/** 进入 `/headless`，等页面外壳与首次取数结束。 */
const openHeadless = async (page: Page): Promise<void> => {
  await page.goto('/headless');
  await expect(page.getByRole('heading', { level: 1, name: 'Headless 实体' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('list-page-info')).not.toContainText('加载中', { timeout: 20000 });
};

/** 经测试 API 直接写入种子文章（绕开 UI，保证列表用例的数据确定）。 */
const seedArticles = async (page: Page): Promise<void> => {
  await waitForSearchApi(page);
  for (const seed of SEEDS) {
    await callSearchApi(page, 'createArticle', { ...seed, body: `body of ${seed.title}`, authorId: 'e2e' });
  }
  await page.getByTestId('headless-list').getByRole('button', { name: '刷新' }).click();
};

/** 把一篇文章填进表单 / 弹窗里的控件。 */
const fillArticle = async (scope: Locator, article: Partial<Record<keyof typeof VALID_ARTICLE, string>>): Promise<void> => {
  for (const [field, value] of Object.entries(article)) {
    const control = scope.getByLabel(field, { exact: true });
    if (field === 'category') await control.selectOption(value);
    else await control.fill(value);
  }
};

/** 列表当前页的标题（按渲染序）。 */
const expectTitles = async (page: Page, titles: readonly string[]): Promise<void> => {
  await expect(page.getByTestId('list-row').locator('td:nth-child(2)')).toHaveText([...titles]);
};

test.describe('Headless 实体：自有控件与样式的真实应用消费', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('表单：必填校验、解析失败保留输入并拒绝提交、取消恢复、提交后落库', async ({ page }) => {
    const problems = watchPage(page);
    await openHeadless(page);
    const form = page.getByTestId('headless-form');
    const title = form.getByLabel('title', { exact: true });
    const viewCount = form.getByLabel('viewCount', { exact: true });

    // 空表单提交：必填字段各自暴露错误，错误经 aria-describedby 关联到控件，焦点落到第一个出错的控件
    await form.getByRole('button', { name: '提交' }).click();
    for (const field of ['title', 'body', 'category', 'authorId']) {
      await expect(form.getByTestId(`error-${field}`)).toBeVisible();
    }
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(title).toHaveAccessibleDescription('title 是必填项');
    await expect(page.getByTestId('list-empty')).toBeVisible();

    // 解析失败：控件保留用户键入的原始文本，错误可读，提交被拒绝且没有写入
    await fillArticle(form, { ...VALID_ARTICLE, viewCount: 'abc' });
    await expect(form.getByTestId('error-viewCount')).toHaveText('viewCount 必须是整数');
    await expect(viewCount).toHaveValue('abc');
    await form.getByRole('button', { name: '提交' }).click();
    await expect(viewCount).toBeFocused();
    await expect(page.getByTestId('list-empty')).toBeVisible();

    // 取消：本地数据、错误和提交尝试全部回到基线
    await expect(form.getByTestId('form-state')).toHaveText('有未提交的修改');
    await form.getByRole('button', { name: '取消' }).click();
    await expect(form.getByTestId('form-state')).toHaveText('没有修改');
    await expect(title).toHaveValue('');
    await expect(viewCount).toHaveValue('0');
    await expect(form.getByRole('alert')).toHaveCount(0);

    // 取消后重新录入并提交：落库、表单回到空白，刷新后仍在
    await fillArticle(form, VALID_ARTICLE);
    await form.getByRole('button', { name: '提交' }).click();
    await expectTitles(page, [VALID_ARTICLE.title]);
    await expect(page.getByTestId('list-page-info')).toContainText('共 1 条');
    await expect(title).toHaveValue('');
    await expect(form.getByTestId('form-state')).toHaveText('没有修改');
    await page.reload();
    await expectTitles(page, [VALID_ARTICLE.title]);

    expect(problems).toEqual([]);
  });

  test('列表与筛选：排序、分页、选择删除，以及查询构建器输出驱动列表', async ({ page }) => {
    const problems = watchPage(page);
    await openHeadless(page);
    await seedArticles(page);
    const list = page.getByTestId('headless-list');
    const info = page.getByTestId('list-page-info');

    // 分页：默认按标题升序，第二页只剩两行
    await expectTitles(page, SEEDS.slice(0, PAGE_SIZE).map(seed => seed.title));
    await expect(info).toContainText('第 1 / 2 页，共 5 条');
    await expect(list.getByRole('button', { name: '上一页' })).toBeDisabled();
    await list.getByRole('button', { name: '下一页' }).click();
    await expectTitles(page, SEEDS.slice(PAGE_SIZE).map(seed => seed.title));
    await expect(info).toContainText('第 2 / 2 页');
    await expect(list.getByRole('button', { name: '下一页' })).toBeDisabled();

    // 排序：先升后降，换排序回到第一页且不混入旧页
    const titleHeader = list.getByRole('columnheader', { name: '标题' });
    await titleHeader.getByRole('button').click();
    await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect(info).toContainText('第 1 / 2 页');
    await titleHeader.getByRole('button').click();
    await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
    await expectTitles(page, ['hl-echo', 'hl-delta', 'hl-charlie']);

    // 选择并删除：选中的行离开列表，总数与页数收敛
    await list.getByRole('checkbox', { name: '选择 hl-echo' }).check();
    await expect(list.getByRole('button', { name: '删除所选 (1)' })).toBeEnabled();
    await list.getByRole('button', { name: '删除所选 (1)' }).click();
    await expect(info).toContainText('共 4 条');
    await expectTitles(page, ['hl-delta', 'hl-charlie', 'hl-bravo']);

    // 查询构建器：增加规则，值为空时校验拒绝，补全后输出等价的 RxDB 查询
    const builder = page.getByTestId('headless-query');
    await builder.getByRole('button', { name: '添加规则' }).click();
    const rule = builder.getByTestId('qb-rule').first();
    await rule.getByLabel('字段').selectOption('title');
    await rule.getByLabel('操作符').selectOption('contains');
    await expect(builder.getByTestId('qb-errors')).toBeVisible();
    await expect(builder.getByRole('button', { name: '应用筛选' })).toBeDisabled();
    await rule.getByLabel('值').fill('bravo');
    await expect(builder.getByTestId('qb-errors')).toHaveCount(0);
    await expect(builder.getByTestId('qb-query')).toHaveText(
      '{"combinator":"and","rules":[{"field":"title","operator":"contains","value":"bravo"}]}'
    );
    await builder.getByRole('button', { name: '应用筛选' }).click();
    await expectTitles(page, ['hl-bravo']);
    await expect(info).toContainText('共 1 条');

    // OR + 嵌套分组：标题含 alpha，或（浏览量 >= 40）；数值规则的值是 number
    await builder.getByLabel('组合方式').first().selectOption('or');
    await rule.getByLabel('值').fill('alpha');
    await builder.getByRole('button', { name: '添加分组' }).click();
    const group = builder.getByRole('group', { name: '子分组' });
    await group.getByRole('button', { name: '添加规则' }).click();
    const nested = group.getByTestId('qb-rule');
    await nested.getByLabel('字段').selectOption('viewCount');
    await nested.getByLabel('操作符').selectOption('>=');
    await nested.getByLabel('值').fill('40');
    await expect(builder.getByTestId('qb-query')).toHaveText(
      '{"combinator":"or","rules":[{"field":"title","operator":"contains","value":"alpha"},{"combinator":"and","rules":[{"field":"viewCount","operator":">=","value":40}]}]}'
    );
    await builder.getByRole('button', { name: '应用筛选' }).click();
    await expectTitles(page, ['hl-delta', 'hl-alpha']);

    // 清空筛选：回到全部（echo 已删除，共 4 条）
    await builder.getByRole('button', { name: '清空筛选' }).click();
    await expect(info).toContainText('共 4 条');
    await expect(builder.getByTestId('qb-rule')).toHaveCount(0);

    expect(problems).toEqual([]);
  });

  test('详情弹窗：新建取消不落库、新建保存、编辑保存、Esc 关闭并恢复焦点', async ({ page }) => {
    const problems = watchPage(page);
    await openHeadless(page);
    const opener = page.getByRole('button', { name: '新建文章' });
    const result = page.getByTestId('dialog-result');

    // 新建 → 填写 → 取消：弹窗关闭、结果为 cancelled、没有留下实体
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '新建文章' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveText(['基本信息']);
    await fillArticle(dialog, VALID_ARTICLE);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(result).toHaveText('弹窗结果：cancelled');
    await expect(page.getByTestId('list-empty')).toBeVisible();

    // 新建 → 空保存被拒绝并留在弹窗里 → 补全后保存：关闭、落库
    await opener.click();
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog.getByTestId('error-title')).toBeVisible();
    await expect(dialog).toBeVisible();
    await fillArticle(dialog, REQUIRED_ONLY);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(result).toHaveText('弹窗结果：saved');
    await expectTitles(page, [VALID_ARTICLE.title]);
    await expect(page.getByTestId('list-row').locator('td:nth-child(4)')).toHaveText(['0']);

    // 编辑：带出已有值，系统字段 Tab 只读展示，改标题保存后列表与刷新后读回都更新
    await page.getByRole('button', { name: `编辑 ${VALID_ARTICLE.title}` }).click();
    const editor = page.getByRole('dialog', { name: '编辑文章' });
    await expect(editor.getByLabel('title', { exact: true })).toHaveValue(VALID_ARTICLE.title);
    await expect(editor.getByLabel('viewCount', { exact: true })).toHaveValue('0');
    await editor.getByRole('tab', { name: '系统字段' }).click();
    await expect(editor.getByRole('tab', { name: '系统字段' })).toHaveAttribute('aria-selected', 'true');
    await expect(editor.getByTestId('system-id')).toHaveText(/^[0-9a-f-]{36}$/);
    await expect(editor.getByTestId('system-createdAt')).not.toHaveText('');
    await editor.getByRole('tab', { name: '基本信息' }).click();
    await fillArticle(editor, { title: 'hl-form-article-edited' });
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(editor).toHaveCount(0);
    await expectTitles(page, ['hl-form-article-edited']);
    await page.reload();
    await expectTitles(page, ['hl-form-article-edited']);

    // Esc 按取消处理，关闭后焦点回到打开它的按钮
    await opener.focus();
    await opener.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(result).toHaveText('弹窗结果：cancelled');
    await expect(opener).toBeFocused();

    expect(problems).toEqual([]);
  });

  test('国际化：应用切到 English 后，校验文案与操作符文案跟随应用语言', async ({ page }) => {
    const problems = watchPage(page);
    await openHeadless(page);
    await page.getByTestId('i18n-locale').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);

    // 校验文案：消费方把应用的运行时传给控制器，提交时按当前语言重新生成
    const form = page.getByTestId('headless-form');
    await form.getByRole('button', { name: '提交' }).click();
    await expect(form.getByTestId('error-title')).toHaveText('title is required');
    await fillArticle(form, { viewCount: 'abc' });
    await expect(form.getByTestId('error-viewCount')).toHaveText('viewCount Must be an integer');

    // 操作符文案：内置操作符带目录键，页面用同一个运行时翻译
    const builder = page.getByTestId('headless-query');
    await builder.getByRole('button', { name: '添加规则' }).click();
    await expect(builder.getByTestId('qb-rule').first().getByLabel('操作符').locator('option').first()).toHaveText(
      'Equals'
    );

    expect(problems).toEqual([]);
  });

  test('生命周期：离开再回来重复挂载，不重复监听也不重复写入', async ({ page }) => {
    const problems = watchPage(page);
    await openHeadless(page);
    const form = page.getByTestId('headless-form');

    await fillArticle(form, VALID_ARTICLE);
    await form.getByRole('button', { name: '提交' }).click();
    await expectTitles(page, [VALID_ARTICLE.title]);

    // 客户端路由离开再回来三次：每次都是全新实例，列表照常取数。
    // 菜单文案三端不同（Angular 随 zh-CN 显示中文），按 href 定位
    for (let round = 0; round < 3; round++) {
      await page.locator('a[href="/home"]').first().click();
      await expect(page.getByTestId('headless-page')).toHaveCount(0);
      await page.locator('a[href="/headless"]').first().click();
      await expect(page.getByTestId('headless-page')).toBeVisible();
      await expectTitles(page, [VALID_ARTICLE.title]);
    }

    // 重复挂载后一次提交只产生一条记录
    await fillArticle(form, { ...VALID_ARTICLE, title: 'hl-after-remount' });
    await form.getByRole('button', { name: '提交' }).click();
    await expect(page.getByTestId('list-page-info')).toContainText('共 2 条');
    await expectTitles(page, ['hl-after-remount', VALID_ARTICLE.title]);

    expect(problems).toEqual([]);
  });
});

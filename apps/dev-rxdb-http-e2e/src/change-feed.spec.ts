/**
 * 变更通知：两个真实页面之间的收敛（US-023 AC#22 / AC#23 / AC#24）。
 *
 * @remarks
 * **两个页面必须是两个 browser context，不能是同一个 context 里的两个 tab。**
 * 同 context 共享同一份 OPFS / IndexedDB 与同一个 `BroadcastChannel`——那种设置下
 * 页面 B 更新了，证明的是 US-009 的跨 tab 同步，与这条 SSE 通道毫无关系。
 * 判错了这一条，整套用例就是绿着的假证据。
 *
 * 三种设置，两个页面全程一致：
 *
 * - 默认（不带参数）：页面 B 不做任何交互，2 秒内自己变过来（AC#22）。
 * - 带 `?changefeed=0`：同样的操作，页面 B 一直是旧值（AC#23）。这是通道出现之前的
 *   症状，冻成对照用例，是为了让「关掉之后什么都不会发生」有据可查。
 * - 默认开着、页内把开关点掉：同一个页面、同一次会话里两种行为都走一遍，
 *   证明那个开关是真的运行时开关，不是伪装成开关的 `location.reload()`。
 */

import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

import { API_BASE_URL } from './env';
import { openDemo, resetDemo } from './support';

/** 筛选用的标题标记。种子标题里不会出现，因此筛出来只有本用例自己造的那一行。 */
const MARKER = 'US023-FEED';

/** AC#22 给的窗口。页面 B 不许有任何交互，全靠通知把这段路走完。 */
const CONVERGE_TIMEOUT_MS = 2000;

/** 对照用例里「等够久」的静默窗口，取收敛窗口的一倍多一点。 */
const SILENCE_WINDOW_MS = 2500;

/** 造一行带标记的数据。走后端 API 而不是页面，起点与两个页面都无关。 */
const seedMarkedRow = async (request: APIRequestContext, title: string): Promise<void> => {
  const response = await request.post(`${API_BASE_URL}/recipes`, { data: { title, status: 'draft', price: 1 } });
  expect(response.ok(), 'POST /recipes 造种子行').toBe(true);
};

/** 打开一个**独立** context 里的页面，并把筛选切到只剩标记行。 */
const openFilteredPage = async (browser: Browser, query: string, expectedTitle: string): Promise<Page> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openDemo(page, query);
  await page.getByTestId('filter-title').fill(MARKER);
  await page.getByTestId('apply-filter').click();
  await expect(page.locator('[data-row-id]')).toHaveCount(1);
  await expect(page.locator('[data-row-id] td').first()).toHaveText(expectedTitle);
  return page;
};

/**
 * 在页面里把那一行的标题改掉并保存。
 *
 * @remarks
 * 填之前**必须**先等表单里出现旧标题。`draft-title` 绑的是单向的
 * `[ngModel]="$draft().title"`：点「改」之后 Angular 才把这一行的现值写进 input，
 * 而 `fill()` 的实现是「全选 + 插入」两步。Angular 那次写入若正好落在这两步之间，
 * 选区会被清掉、光标停在末尾，插入就从**替换**变成了**追加**——存进去的标题成了
 * `US023-FEED 原始US023-FEED 改过` 这样两截拼在一起的东西，报出来的现象
 * （一个单元格里同时有新旧标题）看着极像通知通道把行数据搞重了，其实与通道无关。
 *
 * 通道开着时页面重渲染更频繁，这个窗口就更容易被撞上——它在全量跑里约每三轮翻一次车，
 * 单独跑这个文件却怎么都复现不了。等一下旧值，窗口就关死了。
 */
const renameRow = async (page: Page, from: string, to: string): Promise<void> => {
  await page.getByRole('button', { name: `改 ${from}` }).click();
  await expect(page.getByTestId('draft-title'), '表单要先装上这一行的现值').toHaveValue(from);
  await page.getByTestId('draft-title').fill(to);
  await expect(page.getByTestId('draft-title'), '填完就该是新标题，追加上去的算失败').toHaveValue(to);
  await page.getByTestId('save-edit').click();
  await expect(page.locator('[data-row-id] td').first()).toHaveText(to);
};

/** 面板上的一个计数。 */
const counter = async (page: Page, testId: string): Promise<number> => {
  const text = (await page.getByTestId(testId).textContent()) ?? '';
  return Number.parseInt(text.trim(), 10);
};

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('两个页面都用默认设置：A 改一条，B 不做任何交互也在 2 秒内变过来（AC#22）', async ({ browser, request }) => {
  const before = `${MARKER} 原始`;
  const after = `${MARKER} 改过`;
  await seedMarkedRow(request, before);

  // 空查询串是这条用例的**重点**：实时同步是开箱行为，要一个参数才有的话，
  // 「两个窗口一个改了另一个没反应」就会一直被当成 bug 报上来。
  const pageA = await openFilteredPage(browser, '', before);
  const pageB = await openFilteredPage(browser, '', before);

  await renameRow(pageA, before, after);

  // 页面 B 这一行之后**没有任何操作**——它自己的行必须变过来。
  // 断言落在渲染出来的行上，而不是面板计数：计数说明通道在动，
  // 只有行本身能说明用户真的看见了新值。
  await expect(pageB.locator('[data-row-id] td').first()).toHaveText(after, { timeout: CONVERGE_TIMEOUT_MS });

  await pageA.context().close();
  await pageB.context().close();
});

test('两个页面都带 ?changefeed=0：同样的操作，B 一直是旧值（AC#23）', async ({ browser, request }) => {
  const before = `${MARKER} 原始`;
  const after = `${MARKER} 改过`;
  await seedMarkedRow(request, before);

  const pageA = await openFilteredPage(browser, 'changefeed=0', before);
  const pageB = await openFilteredPage(browser, 'changefeed=0', before);

  await renameRow(pageA, before, after);

  // 等够收敛窗口还多一截。这不是「等它失败」，这是**关掉通道之后的行为**：
  // 没有通道，页面 B 在自己下一次发起查询之前无从知道远端变了。
  //
  // 这里的固定等待没有替代品：要证明的是**什么都不会发生**，而 `expect` 家族
  // 全都是「等到发生为止」。换成任何一条可重试的断言，它都会在第一次求值就通过，
  // 于是这条对照用例在通道被误开的那天照样绿。
  // eslint-disable-next-line playwright/no-wait-for-timeout -- 断言的是「一段时间内无事发生」
  await pageB.waitForTimeout(SILENCE_WINDOW_MS);
  await expect(pageB.locator('[data-row-id] td').first()).toHaveText(before);
  await expect(pageB.getByTestId('feed-off')).toBeVisible();

  // 手动重查一次就能拿到新值——证明 B 的旧值来自「没人告诉它」，
  // 而不是它的查询链路本身坏了。
  await pageB.getByTestId('refetch').click();
  await expect(pageB.locator('[data-row-id] td').first()).toHaveText(after);

  await pageA.context().close();
  await pageB.context().close();
});

test('面板数得出：收到几条、抑制几条回声、重跑几次、发了几次 fetchMetadata（AC#24）', async ({ browser, request }) => {
  const before = `${MARKER} 原始`;
  const after = `${MARKER} 改过`;
  await seedMarkedRow(request, before);

  // 这里**显式**带上 `changefeed=1`，而 AC#22 那条走默认——两条合起来才守得住
  // 「非 `0` 即开」这条判据。只留默认的话，`?changefeed=1` 哪天被改成关掉通道也没人发现。
  const pageA = await openFilteredPage(browser, 'changefeed=1', before);
  const pageB = await openFilteredPage(browser, 'changefeed=1', before);

  // 连上通道本身就会先对每个实体各失效一次（D7），因此这两个数的起点都不是 0——
  // 用例看的是**增量**，不是绝对值。
  const metadataBefore = await counter(pageB, 'feed-metadata-requests');
  const invalidationsBefore = await counter(pageB, 'feed-invalidations');
  await renameRow(pageA, before, after);
  await expect(pageB.locator('[data-row-id] td').first()).toHaveText(after, { timeout: CONVERGE_TIMEOUT_MS });

  // 写入方：收到的是**自己**那一条，因此被抑制——本地早就是最新的，再查一趟纯属白跑。
  await expect.poll(() => counter(pageA, 'feed-received')).toBeGreaterThanOrEqual(1);
  await expect.poll(() => counter(pageA, 'feed-suppressed')).toBeGreaterThanOrEqual(1);

  // 另一端：同一条通知，`clientId` 不是自己的，于是一路走到重跑与一次真实的 fetchMetadata。
  await expect.poll(() => counter(pageB, 'feed-received')).toBeGreaterThanOrEqual(1);
  expect(await counter(pageB, 'feed-suppressed')).toBe(0);
  await expect.poll(() => counter(pageB, 'feed-invalidations')).toBeGreaterThan(invalidationsBefore);
  await expect.poll(() => counter(pageB, 'feed-metadata-requests')).toBeGreaterThan(metadataBefore);

  await pageA.context().close();
  await pageB.context().close();
});

test('清空数据同样是一次变更：A 点「清空数据」，B 不做任何交互也空掉', async ({ browser, request }) => {
  const before = `${MARKER} 原始`;
  await seedMarkedRow(request, before);

  const pageA = await openFilteredPage(browser, '', before);
  const pageB = await openFilteredPage(browser, '', before);

  // 「清空数据」走的是 `__control/clear`，不在 `http-protocol.md` 里——正因如此它极易被
  // 当成纯粹的演示开关而漏掉广播。判据是**库里的行变没变**，不是路径属不属于协议：
  // 漏掉这一条，B 屏幕上留着的是一份后端已经不存在的列表。
  await pageA.getByTestId('clear-backend').click();

  await expect(pageB.locator('[data-row-id]'), 'B 没有任何操作，靠通知空掉').toHaveCount(0, {
    timeout: CONVERGE_TIMEOUT_MS
  });
  await expect(pageB.getByTestId('empty')).toHaveCount(1);

  // 发起方带了 `x-client-id`，收到的是自己那条回声，因此被抑制——它已经自己重查过了。
  await expect.poll(() => counter(pageA, 'feed-suppressed')).toBeGreaterThanOrEqual(1);
  await expect(pageA.locator('[data-row-id]')).toHaveCount(0);

  // 反过来也要成立：重置为种子同样是一次变更，B 照样自己长回来。
  await pageA.getByTestId('reset-backend').click();
  await expect(pageB.locator('[data-row-id]'), '种子里没有标记行，筛选结果仍是空').toHaveCount(0, {
    timeout: CONVERGE_TIMEOUT_MS
  });
  await expect.poll(() => counter(pageB, 'feed-received')).toBeGreaterThanOrEqual(2);

  await pageA.context().close();
  await pageB.context().close();
});

test('面板上的开关是真的运行时开关：同一个页面里关掉、再打开，全程不刷页', async ({ browser, request }) => {
  const before = `${MARKER} 原始`;
  const middle = `${MARKER} 关着的时候改的`;
  const after = `${MARKER} 开回来之后改的`;
  await seedMarkedRow(request, before);

  const pageA = await openFilteredPage(browser, '', before);
  const pageB = await openFilteredPage(browser, '', before);

  // ---- 关掉 ----------------------------------------------------------------
  await pageB.getByTestId('feed-toggle').uncheck();
  await expect(pageB.getByTestId('feed-off')).toBeVisible();

  await renameRow(pageA, before, middle);

  // 与 AC#23 同一条理由：要证明的是「什么都不会发生」，只有固定等待做得到。
  // eslint-disable-next-line playwright/no-wait-for-timeout -- 断言的是「一段时间内无事发生」
  await pageB.waitForTimeout(SILENCE_WINDOW_MS);
  await expect(pageB.locator('[data-row-id] td').first(), '通道关着，B 不该知道 A 改了').toHaveText(before);

  // ---- 开回来 --------------------------------------------------------------
  // 重新接通即触发一次全量失效（D7）：断开期间的那次改动没有人补发通知，
  // 这次失效就是补课的地方——所以 B 现在该直接跳到 `middle`，中间没有任何交互。
  await pageB.getByTestId('feed-toggle').check();
  await expect(pageB.locator('[data-row-id] td').first(), '重新接通即补一次全量失效').toHaveText(middle, {
    timeout: CONVERGE_TIMEOUT_MS
  });

  // 通道确实活着，而不是「刚好那一次失效蒙对了」：再改一次，B 照样自己跟上。
  await renameRow(pageA, middle, after);
  await expect(pageB.locator('[data-row-id] td').first()).toHaveText(after, { timeout: CONVERGE_TIMEOUT_MS });

  // 全程没有 reload：B 的页面对象一次都没导航过，上面这些就都发生在同一次会话里。
  await expect(pageB.getByTestId('feed-toggle')).toBeChecked();

  await pageA.context().close();
  await pageB.context().close();
});

/**
 * @fileoverview BOM 端到端 demo 验收用例（US-525 阶段 A：AC#1~#6 各至少一条）
 *
 * 一份数据集（SC-100）走完全域：两遍 seed 逐字节可见面、三行位号独立、
 * 39/100 发布拒绝、phantom 穿透与算式面板、直连与表单同一存储层环错误、
 * where-used 全部路径（含虚拟件路径）。
 */

import { deterministicId } from '@aiao/rxdb-plugin-bom/testing';
import { expect, Page, test } from '@playwright/test';

const BASE = '/';

const PAGE_HEADINGS = {
  概览: '物料概览',
  展开: '整机展开',
  时间轴: 'ECN 时间轴',
  双图映射: '双图映射',
  成本卷算: '成本卷算',
  反查: '反查'
} as const;

const openPage = async (page: Page, name: keyof typeof PAGE_HEADINGS): Promise<void> => {
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name: PAGE_HEADINGS[name], exact: true })).toBeVisible();
};

const clickButton = async (page: Page, text: string): Promise<void> => {
  await page.getByRole('button', { name: new RegExp(text) }).click();
};

const resetAndSeed = async (page: Page): Promise<void> => {
  await openPage(page, '概览');
  await clickButton(page, '重置并装载种子');
  // 种子装载（wa-sqlite 启动 + 装载）需要数秒
  // 阶段 E：A/B 层、C 层、D 层与 E 层各一个历史批次
  await expect(page.getByTestId('row-counts')).toContainText('bom_history_batch=4', { timeout: 30000 });
};

const explode = async (page: Page): Promise<void> => {
  await openPage(page, '展开');
  await clickButton(page, '展开整机');
  await expect(page.locator('.requirement-row')).toHaveCount(14, { timeout: 30000 });
};

test.describe('BOM demo（US-525 阶段 A）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test('AC#1 两遍 seed 的可见面逐字相同；批次号与基准是常量', async ({ page }) => {
    await resetAndSeed(page);
    const paint = await page.evaluate(() =>
      performance.getEntriesByType('paint').map(entry => ({ name: entry.name, startTime: entry.startTime }))
    );
    await test.info().attach('first-paint.json', { body: JSON.stringify(paint), contentType: 'application/json' });
    console.info(`BOM 首屏测量：${JSON.stringify(paint)}`);
    const first = await page.getByTestId('row-counts').textContent();
    await page.getByTestId('item-inventory-toggle').click();
    await expect(page.getByTestId('item-inventory-toggle')).toContainText('41');
    await expect(page.getByTestId('item-inventory-row')).toHaveCount(41);
    await expect(page.getByTestId('item-inventory-row').first()).toBeVisible();
    await expect(page.getByTestId('item-inventory')).toContainText('SC-100');
    await expect(page.getByTestId('item-inventory')).toContainText('B-01');
    // 第二遍：清库重装
    await resetAndSeed(page);
    const second = await page.getByTestId('row-counts').textContent();
    expect(second).toBe(first);
    // 阶段 E：新增 6 个物料、2 张子装配头及 6 段发生项；ECN 将 E 层三个部位挂回整机。
    expect(second).toContain('item=41');
    expect(second).toContain('bom_line_occurrence=42');
    expect(second).toContain('ecn=4');
    await expect(page.getByTestId('seed-info')).toContainText('scooter-seed-a');
    await expect(page.getByTestId('seed-info')).toContainText('2026-01-01T00:00:00.000Z');
  });

  test('AC#2 同一 10kΩ 电阻三行独立可见，位号清单各自完整', async ({ page }) => {
    await resetAndSeed(page);
    await explode(page);
    const r10kRows = page.locator('.requirement-row[data-item="R10K"]');
    await expect(r10kRows).toHaveCount(3);
    const qtyValues = await r10kRows.locator('.qty').allTextContents();
    expect(qtyValues.map(text => text.trim())).toEqual(['2 pcs', '3 pcs', '1 pcs']);
    const designatorTexts = (await r10kRows.locator('.designators').allTextContents()).map(text => text.trim());
    expect(designatorTexts).toEqual(['位号：R1, R2', '位号：R3, R4, R5', '位号：R6']);
  });

  test('AC#3 位号 39/qty 100：草稿可存、发布拒绝且错误同时给两个数', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '展开');
    await clickButton(page, '发布演示头');
    const result = page.getByTestId('publish-result');
    await expect(result).toContainText('39', { timeout: 30000 });
    await expect(result).toContainText('100');
  });

  test('AC#4 WH-01 phantom 穿透：无需求行、面板显示换算与 COALESCE 判定来源', async ({ page }) => {
    await resetAndSeed(page);
    await explode(page);
    // 无 WH-01 需求行
    await expect(page.locator('.requirement-row[data-item="WH-01"]')).toHaveCount(0);
    // 选中导线行：面板第 6/7 步与穿透记录（COALESCE 来源修订级、P = 1 m）
    await page.locator('.requirement-row[data-item="WIRE"]').click();
    await expect(page.locator('.step-row[data-step="6. D"]')).toContainText('1.2');
    await expect(page.locator('.step-row[data-step="7. 需求"]')).toContainText('1.2');
    await expect(page.locator('.step-row[data-step="penetration"]')).toContainText('WH-01');
    await expect(page.locator('.step-row[data-step="penetration"]')).toContainText('P = 1 m');
    await expect(page.locator('.step-row[data-step="penetration"]')).toContainText('revision');
  });

  test('AC#5 直连与表单两条路径报同一存储层环错误（路径一致）', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '展开');
    await clickButton(page, '直连写入成环边');
    const raw = page.getByTestId('raw-cycle-result');
    await expect(raw).toContainText('rxdb:bom_cycle:', { timeout: 30000 });
    const rawText = await raw.textContent();
    const rawPath = (rawText ?? '').match(/rxdb:bom_cycle:([^\s"']+)/)?.[1] ?? '';
    await clickButton(page, '表单写入同一条边');
    const form = page.getByTestId('form-cycle-result');
    await expect(form).toContainText('检测到环', { timeout: 30000 });
    const formText = await form.textContent();
    // 表单路径是同一存储层错误的归一形态：提取物料 id 序列与直连错误码里的路径一致
    // 表单消息「检测到环：A → B」：提取到行尾的路径段并归一为与错误码一致的 '>' 串
    const formPath = ((formText ?? '').match(/检测到环：([^\n]+)/)?.[1] ?? '').replace(/ → /g, '>').trim();
    expect(formPath).toBe(rawPath);
  });

  test('US-525 AC#7 替代组 proportional：COVER-ASSY 展开三件分摊 50/60/10；0.5/0.3 发布拒绝给 0.8', async ({
    page
  }) => {
    await resetAndSeed(page);
    await openPage(page, '展开');
    // 根物料选 COVER-ASSY
    await page.getByTestId('root-select').selectOption({ label: 'COVER-ASSY' });
    await clickButton(page, '展开整机');
    const r10k = page.locator('.requirement-row[data-item="R10K"] .qty');
    await expect(r10k).toHaveText('50 pcs', { timeout: 30000 });
    await expect(page.locator('.requirement-row[data-item="R10K-ALT1"] .qty')).toHaveText('60 pcs');
    await expect(page.locator('.requirement-row[data-item="R10K-ALT2"] .qty')).toHaveText('10 pcs');
    // ② draft 组 0.5/0.3 发布拒绝且给实际合计 0.8
    await clickButton(page, '发布 draft 组');
    const result = page.getByTestId('substitute-result');
    await expect(result).toContainText('0.8', { timeout: 30000 });
  });

  test('US-525 AC#8 外壳下料：consume 需求 2、by_product 0.3、scrap_out 0.1 分列', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '展开');
    await page.getByTestId('root-select').selectOption({ label: 'HOUSING' });
    await clickButton(page, '展开整机');
    await expect(page.locator('.requirement-row[data-item="SHEET"] .qty')).toHaveText('2 pcs', { timeout: 30000 });
    // 产出区块：副产与废料不进需求行
    await expect(page.locator('.requirement-row[data-item="OFFCUT"]')).toHaveCount(0);
    await expect(page.locator('[data-output="OFFCUT"] .qty')).toHaveText('0.3 pcs');
    await expect(page.locator('[data-output="TRIM"][data-direction="scrap_out"] .qty')).toHaveText('0.1 pcs');
  });

  test('US-525 AC#9 工序损耗与分摊：PROCESS-01 需求 101.8，面板第 5 步显示累乘', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '展开');
    await page.getByTestId('root-select').selectOption({ label: 'PROCESS-01' });
    await page.locator('input').nth(1).fill('100');
    await clickButton(page, '展开整机');
    const material = page.locator('.requirement-row[data-item="P-MATERIAL"] .qty');
    await expect(material).toHaveText('101.8 pcs', { timeout: 30000 });
    // 选中行：面板第 5 步显示工序损耗后的值（不再是占位「—」）
    await page.locator('.requirement-row[data-item="P-MATERIAL"]').click();
    await expect(page.locator('.step-row[data-step="5. G″"] .value')).toHaveText('101.8 pcs');
  });

  test('既有库重开：不重置直接重载页面，插件新表与触发器在既有库上幂等安装', async ({ page }) => {
    await resetAndSeed(page);
    await explode(page);
    // 重载后连接的是已有库：连接期安装全部触发器（幂等 DDL），种子行原样可用
    await page.reload();
    await explode(page);
    await expect(page.locator('.requirement-row[data-item="MCU"] .qty')).toHaveText('2 pcs');
    await expect(page.locator('.requirement-row[data-item="WIRE"] .qty')).toHaveText('1.2 m');
  });

  test('AC#6 M3 螺钉 where-used：全部父件与路径，含经由虚拟件的那条', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '反查');
    await clickButton(page, '反查 M3');
    const lines = page.getByTestId('where-used-line');
    // 全部父件与每条路径：SC-100 直连、WH-01 直连、SC-100 经 WH-01（2 跳，虚拟件路径）
    await expect(lines).toHaveCount(3, { timeout: 30000 });
    const texts = await lines.allTextContents();
    // SC-100 出现两条：直连（1 跳）与经 WH-01（2 跳，路径中段的 WH-01 以发生项 id 前缀显示）
    expect(texts.filter(text => text.includes('SC-100')).length).toBe(2);
    expect(texts.some(text => text.includes('2 跳') && text.includes('SC-100'))).toBe(true);
    expect(texts.some(text => text.includes('1 跳') && text.includes('WH-01'))).toBe(true);
  });

  test('US-525 AC#10 评估日切换：两段生效期行集不同且各自自洽（不读系统时钟）', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '展开');
    // 生效前评估日：FRAME 在、无 SEAT
    await page.getByTestId('as-of-date').fill('2026-09-22');
    await explode(page);
    await expect(page.locator('.requirement-row[data-item="FRAME"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="SEAT"]')).toHaveCount(0);
    // 生效后评估日：SEAT 在、FRAME 消失——两次展开的行集不同且各自自洽
    await page.getByTestId('as-of-date').fill('2026-10-15');
    await clickButton(page, '展开整机');
    await expect(page.locator('.requirement-row[data-item="SEAT"]')).toHaveCount(1, { timeout: 30000 });
    await expect(page.locator('.requirement-row[data-item="FRAME"]')).toHaveCount(0);
    // 改量 2→3 与改版子件在生效后可见
    await expect(page.locator('.requirement-row[data-item="R10K"] .qty').first()).toHaveText('3 pcs');
    await expect(page.locator('.requirement-row[data-item="MCU-V2"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="BMS-V2"]')).toHaveCount(1);
  });

  test('US-525 AC#11 ECN-2026-014 影响面与差异：整机、四类变更各自可见', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '时间轴');
    // 选中 ECN-2026-014
    await page.getByTestId('ecn-select').selectOption({ label: 'ECN-2026-014（released，2026-10-01）' });
    await clickButton(page, '查影响面');
    const impactLines = page.getByTestId('ecn-impact-line');
    await expect(impactLines.first()).toContainText('SC-100', { timeout: 30000 });
    await expect(impactLines.first()).toContainText('PCBA');
    await expect(impactLines.first()).toContainText('BATT');
    const impactTexts = await impactLines.allTextContents();
    expect(impactTexts.some(text => text.includes('受影响整机') && text.includes('SC-100'))).toBe(true);
    await clickButton(page, '查差异');
    const diffLines = page.getByTestId('ecn-diff-line');
    await expect(diffLines).toHaveCount(5, { timeout: 30000 });
    const diffTexts = await diffLines.allTextContents();
    expect(diffTexts.filter(text => text.startsWith('新增')).length).toBe(1);
    expect(diffTexts.filter(text => text.startsWith('删除')).length).toBe(1);
    expect(diffTexts.filter(text => text.startsWith('改量')).length).toBe(1);
    expect(diffTexts.filter(text => text.startsWith('改版')).length).toBe(2);
  });

  test('US-525 AC#12 现场 ECN 取消整体回退；已生效种子 ECN 取消拒绝', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '时间轴');
    // ① 现场新建并发布（改 3 张 BOM 5 行，生效日晚于宿主 UTC 当日）→ 取消 → 整体回退
    await clickButton(page, '现场新建并发布 ECN');
    const actionResult = page.getByTestId('ecn-action-result');
    await expect(actionResult).toContainText('发布成功', { timeout: 30000 });
    await clickButton(page, '取消现场 ECN');
    await expect(actionResult).toContainText('取消成功', { timeout: 30000 });
    // 页面刷新后不存在「部分行已生效、部分未生效」的中间态：评估日切到明天仍是 A/B 层结构
    await page.reload();
    await openPage(page, '展开');
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await page.getByTestId('as-of-date').fill(tomorrow.toISOString().slice(0, 10));
    await clickButton(page, '展开整机');
    await expect(page.locator('.requirement-row[data-item="SEAT-LIVE"]')).toHaveCount(0, { timeout: 30000 });
    // 现场 ECN 截止的 WH-01 已整体回退：虚拟件穿透照常（WIRE 需求行在；FRAME 在明天评估日
    // 由种子 ECN-2026-014 截止，与现场 ECN 无关）
    await expect(page.locator('.requirement-row[data-item="WIRE"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="R10K"]').first()).toContainText('3 pcs');
    // ② 对已生效种子 ECN 点取消 → 拒绝，提示改走更正 ECN
    await openPage(page, '时间轴');
    await clickButton(page, '对已生效种子 ECN 点取消');
    await expect(page.getByTestId('ecn-action-result')).toContainText(/更正|已生效/, { timeout: 30000 });
  });

  test('US-525 AC#13 双图并排：EBOM 钣金外壳 / MBOM 板材 + 2 工序件；覆盖率报未覆盖', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '双图映射');
    await page.getByTestId('as-of-date').fill('2026-10-15');
    await clickButton(page, '双图并排展开');
    // 两侧层级结构不同且各自自洽：EBOM 一行 SHEET；MBOM 三行（板材 + 2 个工序件）
    const ebomTree = page.getByTestId('ebom-tree');
    await expect(ebomTree.locator('.requirement-row[data-item="SHEET"]')).toHaveCount(1, { timeout: 30000 });
    await expect(ebomTree.locator('.requirement-row[data-item="WIP-BEND"]')).toHaveCount(0);
    const mbomTree = page.getByTestId('mbom-tree');
    await expect(mbomTree.locator('.requirement-row[data-item="SHEET"]')).toHaveCount(1);
    await expect(mbomTree.locator('.requirement-row[data-item="WIP-BEND"]')).toHaveCount(1);
    await expect(mbomTree.locator('.requirement-row[data-item="WIP-CUT"]')).toHaveCount(1);
    // 覆盖率：split 1:3 三个目标行全部已覆盖（路径级映射在 scope 内）
    await clickButton(page, '查覆盖率');
    const coverage = page.getByTestId('coverage-line');
    await expect(coverage).toHaveCount(1, { timeout: 30000 });
    await expect(coverage.first()).toContainText('已覆盖');
  });

  test('US-525 AC#14 整机卷算逐项等于手工 golden：39.1204…、HOUSING 材料/加工/制费/抵减', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '成本卷算');
    await page.getByTestId('as-of-date').fill('2026-10-15');
    await clickButton(page, '卷算');
    // 根节点：批次与单位成本等于 golden（34 位有效数字 half-even）
    const head = page.locator('.cost-row[data-kind="head"]').first();
    await expect(head.locator('[data-amount]')).toHaveText('39.12040816326530612244897959183674', { timeout: 30000 });
    // HOUSING 节点：材料 SHEET 2、加工 0.5h × 2 = 1、制费 0.2、副产抵减 OFFCUT 0.3
    // （材料行 data-item 是子件；卷算树里 SHEET 只在 HOUSING 节点出现一次）
    const sheetMaterial = page.locator('.cost-row[data-kind="material"][data-item="SHEET"]');
    await expect(sheetMaterial).toHaveCount(1);
    await expect(sheetMaterial.locator('[data-amount]')).toHaveText('2');
    await expect(page.locator('.cost-row[data-kind="processing"]').first()).toContainText('加工 工序 10');
    await expect(page.locator('.cost-row[data-kind="processing"]').first().locator('[data-amount]')).toHaveText('1');
    await expect(page.locator('.cost-row[data-kind="overhead"]').first().locator('[data-amount]')).toHaveText('0.2');
    await expect(page.locator('.cost-row[data-kind="credit"]').first()).toContainText('OFFCUT');
    await expect(page.locator('.cost-row[data-kind="credit"]').first().locator('[data-amount]')).toHaveText('-0.3');
  });

  test('US-525 AC#15 缺成本子件：卷算报缺失项而非 0', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '成本卷算');
    await page.getByTestId('cost-root-select').selectOption({ label: 'COST-DEMO（故意缺成本）' });
    await clickButton(page, '卷算');
    const error = page.getByTestId('cost-error');
    // 错误消息点名缺成本的物料 id（COST-MISSING 的确定性 id，不经 0 兜底）
    await expect(error).toContainText(deterministicId('item:COST-MISSING'), { timeout: 30000 });
    await expect(error).toContainText('缺成本');
    await expect(error).toContainText('不以 0 兜底');
    // 明细树整体不产出（不以 0 兜底的部分树）
    await expect(page.locator('.cost-row')).toHaveCount(0);
  });

  test('阶段 D 既有库重开：D 层实体与映射重开后原样可用（幂等）', async ({ page }) => {
    await resetAndSeed(page);
    await openPage(page, '成本卷算');
    await page.getByTestId('as-of-date').fill('2026-10-15');
    await clickButton(page, '卷算');
    await expect(page.locator('.cost-row[data-kind="head"]').first().locator('[data-amount]')).toHaveText(
      '39.12040816326530612244897959183674',
      { timeout: 30000 }
    );
    // 重载后连接的是已有库：连接期安装全部触发器（幂等 DDL），映射与成本输入原样可用
    await page.reload();
    await openPage(page, '双图映射');
    await clickButton(page, '双图并排展开');
    await expect(page.getByTestId('mbom-tree').locator('.requirement-row[data-item="WIP-BEND"]')).toHaveCount(1, {
      timeout: 30000
    });
  });
});

test.describe('BOM demo（US-525 阶段 E）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await resetAndSeed(page);
  });

  test('US-525 AC#17 扩展属性拒绝非法值与缺必填，按声明类型过滤并排除缺字段与 null', async ({ page }) => {
    await page.getByTestId('ext-value').fill('maybe');
    await page.getByTestId('ext-save').click();
    await expect(page.getByTestId('ext-result')).toContainText('rohs');
    await expect(page.getByTestId('ext-result')).toContainText('yes');
    await expect(page.getByTestId('ext-result')).toContainText('no');
    await page.getByTestId('ext-clear-required').click();
    await expect(page.getByTestId('ext-result')).toContainText(/rohs.*必填|必填.*rohs/);
    await page.getByTestId('ext-value').fill('yes');
    await page.getByTestId('ext-save').click();
    await expect(page.getByTestId('ext-result')).toContainText('保存成功');
    await page.getByTestId('ext-filter-value').fill('yes');
    await page.getByTestId('ext-filter').click();
    await expect(page.getByTestId('ext-filter-row')).toHaveCount(1);
    await expect(page.getByTestId('ext-filter-row')).toContainText('B-01');
    await page.getByTestId('ext-filter-op').selectOption('ne');
    await page.getByTestId('ext-filter-value').fill('no');
    await page.getByTestId('ext-filter').click();
    await expect(page.getByTestId('ext-filter-row')).toHaveCount(1);
    await expect(page.getByTestId('ext-filter-row')).toContainText('B-01');
  });

  test('US-525 AC#18 同一整机序列 136 选旧件、137 选新件，清空保留正常行并列未解析候选', async ({ page }) => {
    await openPage(page, '展开');
    await page.getByTestId('root-select').selectOption('SC-100');
    await page.getByTestId('as-of-date').fill('2026-10-16');
    await expect(page.getByTestId('root-select')).toHaveValue('SC-100');
    await page.getByTestId('unit-input').fill('136');
    await expect(page.getByTestId('root-select')).toHaveValue('SC-100');
    await clickButton(page, '展开整机');
    await expect(page.locator('.requirement-row[data-item="UNIT-PART-OLD"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="UNIT-PART-NEW"]')).toHaveCount(0);
    await expect(page.locator('.requirement-row[data-item="B-01"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="CONFIG-PART"]')).toHaveCount(1);
    await page.getByTestId('unit-input').fill('137');
    await clickButton(page, '展开整机');
    await expect(page.locator('.requirement-row[data-item="UNIT-PART-NEW"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="UNIT-PART-OLD"]')).toHaveCount(0);
    await page.getByTestId('unit-input').fill('');
    await clickButton(page, '展开整机');
    await expect(page.getByTestId('unit-unresolved')).toContainText('未解析');
    await expect(page.getByTestId('unit-candidate')).toHaveCount(2);
    await expect(page.getByTestId('unit-unresolved')).toContainText('UNIT-PART-OLD');
    await expect(page.getByTestId('unit-unresolved')).toContainText('UNIT-PART-NEW');
    await expect(page.getByTestId('unit-unresolved')).toContainText('136');
    await expect(page.getByTestId('unit-unresolved')).toContainText('137');
    await expect(page.locator('.requirement-row[data-item="UNIT-PART-OLD"]')).toHaveCount(0);
    await expect(page.locator('.requirement-row[data-item="UNIT-PART-NEW"]')).toHaveCount(0);
    await expect(page.locator('.requirement-row[data-item="UNIT-DEMO"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="B-01"]')).toHaveCount(1);
    await expect(page.locator('.requirement-row[data-item="CONFIG-PART"]')).toHaveCount(1);
  });

  test('US-525 AC#19 配置红入选、蓝落选，冲突与缺必填不保留部分结构', async ({ page }) => {
    await openPage(page, '展开');
    await page.getByTestId('config-red').check();
    await page.getByTestId('config-explode').click();
    await expect(page.getByTestId('config-tree').locator('.requirement-row[data-item="CONFIG-PART"]')).toHaveCount(1);
    await page.getByTestId('config-red').uncheck();
    await page.getByTestId('config-blue').check();
    await page.getByTestId('config-explode').click();
    await expect(page.getByTestId('config-empty')).toBeVisible();
    await page.getByTestId('config-red').check();
    await page.getByTestId('config-explode').click();
    await expect(page.getByTestId('config-error')).toContainText('红蓝互斥');
    await expect(page.getByTestId('config-tree').locator('.requirement-row')).toHaveCount(0);
    await page.getByTestId('config-red').uncheck();
    await page.getByTestId('config-blue').uncheck();
    await page.getByTestId('config-explode').click();
    await expect(page.getByTestId('config-error')).toContainText('配置不完整');
  });

  test('US-525 AC#20 导出含 manifest 与十进制串，坏文件全回滚，修正重导并发布可见', async ({ page }) => {
    await openPage(page, '展开');
    await clickButton(page, '展开整机');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-bom').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const stream = await download.createReadStream();
    if (!stream) throw new Error('导出下载没有可读内容');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      manifest: Record<string, unknown>;
      occurrences: unknown[][];
    };
    expect(exported.manifest).toBeTruthy();
    expect(exported.occurrences.length).toBeGreaterThan(0);
    expect(exported.occurrences.every(row => typeof row[10] === 'string')).toBe(true);
    const parent = { itemNo: 'E-IMPORT-ROOT', revisionNo: 'A', bomType: 'ebom', orgId: 'org-x', alternativeNo: 1 };
    const records: Record<string, unknown>[] = [
      { kind: 'item', source_ref: 'root', itemNo: parent.itemNo, ext: { rohs: 'yes' } },
      { kind: 'item', source_ref: 'child', itemNo: 'E-IMPORT-CHILD', ext: { rohs: 'yes' } },
      { kind: 'revision', source_ref: 'revision', itemNo: parent.itemNo, revisionNo: 'A' },
      { kind: 'header', source_ref: 'header', ...parent, baseQty: '1', baseUom: 'pcs' },
      { kind: 'line', source_ref: 'line', ...parent, lineNo: 10 },
      {
        kind: 'occurrence',
        source_ref: 'number',
        ...parent,
        lineNo: 10,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        childItemNo: 'E-IMPORT-CHILD',
        qty: 1,
        uom: 'pcs'
      },
      { kind: 'item', source_ref: 'duplicate-a', itemNo: 'E-DUP', ext: { rohs: 'yes' } },
      { kind: 'item', source_ref: 'duplicate-b', itemNo: 'E-DUP', ext: { rohs: 'yes' } },
      { kind: 'line', source_ref: 'cycle-line', ...parent, lineNo: 20 },
      {
        kind: 'occurrence',
        source_ref: 'cycle',
        ...parent,
        lineNo: 20,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        childItemNo: parent.itemNo,
        qty: '1',
        uom: 'pcs'
      }
    ];
    const upload = async (payload: Record<string, unknown>[]): Promise<void> => {
      await page.getByTestId('import-file').setInputFiles({
        name: 'bom-import.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(payload))
      });
      await page.getByTestId('import-bom').click();
    };
    await upload(records);
    await expect(page.getByTestId('import-status')).toContainText('整批回滚');
    await expect(page.getByTestId('import-diagnostics')).toContainText('source_ref number');
    await expect(page.getByTestId('import-diagnostics')).toContainText('source_ref cycle');
    await expect(page.getByTestId('import-diagnostics')).toContainText('duplicate-a');
    await expect(page.getByTestId('root-select').locator('option[value="E-IMPORT-ROOT"]')).toHaveCount(0);
    const fixed = records
      .slice(0, 6)
      .map(record => (record['source_ref'] === 'number' ? { ...record, qty: '1' } : record));
    await upload(fixed);
    await expect(page.getByTestId('import-status')).toContainText('草稿');
    await page.getByTestId('import-publish-date').fill('2099-01-01');
    await page.getByTestId('import-publish').click();
    await expect(page.getByTestId('import-status')).toContainText('发布成功');
    await page.getByTestId('as-of-date').fill('2099-01-02');
    await page.getByTestId('root-select').selectOption('E-IMPORT-ROOT');
    await clickButton(page, '展开整机');
    await expect(page.locator('.requirement-row[data-item="E-IMPORT-CHILD"] .qty')).toHaveText('1 pcs');
  });
});

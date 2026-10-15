/**
 * @fileoverview BOM 端到端 demo 验收用例（US-525 阶段 A：AC#1~#6 各至少一条）
 *
 * 一份数据集（SC-100）走完全域：两遍 seed 逐字节可见面、三行位号独立、
 * 39/100 发布拒绝、phantom 穿透与算式面板、直连与表单同一存储层环错误、
 * where-used 全部路径（含虚拟件路径）。
 */

import { expect, Page, test } from '@playwright/test';

const BASE = '/';

const clickButton = async (page: Page, text: string): Promise<void> => {
  await page.getByRole('button', { name: new RegExp(text) }).click();
};

const resetAndSeed = async (page: Page): Promise<void> => {
  await clickButton(page, '重置并装载种子');
  // 种子装载（wa-sqlite 启动 + 装载）需要数秒
  // 阶段 C：A/B 层与 C 层各一个历史批次
  await expect(page.getByTestId('row-counts')).toContainText('bom_history_batch=2', { timeout: 30000 });
};

const explode = async (page: Page): Promise<void> => {
  await clickButton(page, '展开整机');
  await expect(page.locator('.requirement-row')).toHaveCount(14, { timeout: 30000 });
};

test.describe('BOM demo（US-525 阶段 A）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test('AC#1 两遍 seed 的可见面逐字相同；批次号与基准是常量', async ({ page }) => {
    await resetAndSeed(page);
    const first = await page.getByTestId('row-counts').textContent();
    // 第二遍：清库重装
    await resetAndSeed(page);
    const second = await page.getByTestId('row-counts').textContent();
    expect(second).toBe(first);
    // 阶段 C：C 层种子追加 5 个物料、6 段发生项、2 张 ECN
    expect(second).toContain('item=27');
    expect(second).toContain('bom_line_occurrence=28');
    expect(second).toContain('ecn=2');
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
    expect(designatorTexts).toEqual([
      '位号：R1, R2',
      '位号：R3, R4, R5',
      '位号：R6'
    ]);
  });

  test('AC#3 位号 39/qty 100：草稿可存、发布拒绝且错误同时给两个数', async ({ page }) => {
    await resetAndSeed(page);
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

  test('US-525 AC#7 替代组 proportional：COVER-ASSY 展开三件分摊 50/60/10；0.5/0.3 发布拒绝给 0.8', async ({ page }) => {
    await resetAndSeed(page);
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
    // ① 现场新建并发布（改 3 张 BOM 5 行，生效日晚于宿主 UTC 当日）→ 取消 → 整体回退
    await clickButton(page, '现场新建并发布 ECN');
    const actionResult = page.getByTestId('ecn-action-result');
    await expect(actionResult).toContainText('发布成功', { timeout: 30000 });
    await clickButton(page, '取消现场 ECN');
    await expect(actionResult).toContainText('取消成功', { timeout: 30000 });
    // 页面刷新后不存在「部分行已生效、部分未生效」的中间态：评估日切到明天仍是 A/B 层结构
    await page.reload();
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
    await clickButton(page, '对已生效种子 ECN 点取消');
    await expect(page.getByTestId('ecn-action-result')).toContainText(/更正|已生效/, { timeout: 30000 });
  });
});

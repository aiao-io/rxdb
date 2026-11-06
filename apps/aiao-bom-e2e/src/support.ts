/**
 * @fileoverview BOM demo e2e 共用的种子期望值与交互助手
 *
 * 期望值一律从 `@aiao/rxdb-plugin-bom/testing` 派生（行数常量由包内全量种子测试按真实落库守住），
 * 四个 spec 共用，改种子不需要同步 e2e。
 */

import {
  SCOOTER_DATASET_F,
  SCOOTER_GOLDEN,
  SCOOTER_SEED_ROW_COUNTS,
  deterministicId
} from '@aiao/rxdb-plugin-bom/testing';
import { expect, type Locator, type Page } from '@playwright/test';

/** SC-100 全量种子（A～F 层）装载后的行数，与概览「数据版本与记录统计」逐项对应。 */
export const SCOOTER_SEED_ROWS = SCOOTER_SEED_ROW_COUNTS;

/** 默认评估日整机展开的需求行数，取自手写 golden，不在 spec 里另抄一份。 */
export const SCOOTER_REQUIREMENT_ROWS = SCOOTER_GOLDEN.requirements.length;

/** 种子整机实例的确定性 id，下拉按值选择，不绑定含中文名的展示文案。 */
export const instanceRootId = (serialNumber: string): string => {
  const node = SCOOTER_DATASET_F.nodes.find(
    candidate => candidate.parentSeed === null && candidate.serialNumber === serialNumber
  );
  if (!node) throw new Error(`种子里没有整机实例 ${serialNumber}`);
  return deterministicId(node.seed);
};

/**
 * 触发一个必然弹出确认框的操作并接受它。
 *
 * 监听与触发并发且只消费一次；没弹框就超时失败，不会留下吞掉后续弹框的残留监听。
 */
export const acceptDialog = async (page: Page, trigger: () => Promise<void>): Promise<void> => {
  const accepted = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await trigger();
  await accepted;
};

/** 同 {@link acceptDialog}，但取消确认框。 */
export const dismissDialog = async (page: Page, trigger: () => Promise<void>): Promise<void> => {
  const dismissed = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await trigger();
  await dismissed;
};

/** 先展开控件的外层折叠区，再按正常交互操作控件。 */
export const revealDetails = async (target: Locator): Promise<void> => {
  await target.waitFor({ state: 'attached' });
  const ancestors = target.locator('xpath=ancestor::details');
  for (let index = 0; index < (await ancestors.count()); index++) {
    const details = ancestors.nth(index);
    if ((await details.getAttribute('open')) === null) await details.locator(':scope > summary').click();
  }
};

/**
 * 展开 summary 文案匹配的 `<details>`。
 *
 * 结果区重渲染会换成新的折叠节点：读取 open 与点击放进同一个重试块，直到当前节点确实展开。
 */
export const openDetails = async (page: Page, label: string | RegExp): Promise<void> => {
  const summary = page.locator('summary').filter({ hasText: label });
  await revealDetails(summary);
  const details = summary.locator('..');
  await expect(async () => {
    if ((await details.getAttribute('open')) === null) await summary.click();
    await expect(details).toHaveAttribute('open', '', { timeout: 1000 });
  }).toPass();
};

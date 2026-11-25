import type { PullResult, PushResult, SyncFailure, SyncRejection } from '@aiao/rxdb';
import { getErrorMessage } from '../error-message';
import type { DemoOrderItem } from './order-entities';

/** 新建订单项要填的字段 */
export interface OrderItemDraft {
  readonly productName: string;
  readonly quantity: number;
  readonly price: number;
}

/** 表单里原样的输入 */
export interface OrderItemInput {
  readonly productName: string;
  readonly quantity: string;
  readonly price: string;
}

/** 表单校验的结果：通过时交出订单项，不通过时交出原因 */
export type OrderItemDraftResult =
  { readonly ok: true; readonly draft: OrderItemDraft } | { readonly ok: false; readonly error: string };

/** 一轮推拉在页面上的说法：完成时给提示，有仓库失败时给原因 */
export interface SyncOutcome {
  readonly notice: string | null;
  readonly error: string | null;
}

/**
 * 一张订单的金额
 *
 * @param items - 这张订单的订单项
 * @returns 数量乘单价之和；没有订单项是 0
 */
export function orderTotal(items: readonly Pick<DemoOrderItem, 'quantity' | 'price'>[]): number {
  return items.reduce((total, item) => total + item.quantity * item.price, 0);
}

/**
 * 订单项按所属订单分组
 *
 * @param items - 本机的订单项
 * @returns 订单 id → 这张订单的订单项，组内保持原顺序
 */
export function itemsByOrder<T extends { readonly orderId: string }>(
  items: readonly T[]
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(item.orderId, [...(grouped.get(item.orderId) ?? []), item]);
  return grouped;
}

/**
 * 校验新建订单项的表单
 *
 * @param input - 表单里原样的输入
 * @returns 商品名去掉首尾空白，数量是正整数、单价是不小于 0 的数时交出订单项，否则交出原因
 */
export function parseOrderItemDraft(input: OrderItemInput): OrderItemDraftResult {
  const productName = input.productName.trim();
  if (!productName) return { ok: false, error: '先填商品名称' };
  const quantity = parseNumber(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: '数量要是正整数' };
  const price = parseNumber(input.price);
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: '单价要是不小于 0 的数' };
  return { ok: true, draft: { productName, quantity, price } };
}

/** 空白不当成 0：`Number('')` 是 0，这里要它不合法 */
function parseNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

/**
 * 依赖的客户已不在远端、因此被拒的订单
 *
 * @param rejections - 最近一轮推送的被拒清单（`syncState.lastRejections`）
 * @param customers - 本机的客户：被删的客户在拉取之前还在本机，用来报出名字
 * @returns 每条一句话；只认依赖失败、指向客户的订单，其余照样只在被拒清单里
 *
 * @remarks
 * 例如别人已在远端删了这位客户、本机还没拉取就给他新建了订单（AC#4）：推送时远端的外键拒绝它（23503），
 * 被拒的订单按 US-218 在本机对齐成远端的样子（删掉）；拉取之后，这位客户也会从本机消失。
 */
export function describeDependencyRejections(
  rejections: readonly SyncRejection[],
  customers: readonly { readonly id: string; readonly name: string }[]
): string[] {
  return rejections.flatMap(rejection => {
    const parent = rejection.dependsOn;
    if (rejection.entity !== 'DemoOrder' || rejection.reason !== 'dependency') return [];
    if (!parent || !('entity' in parent) || parent.entity !== 'DemoCustomer') return [];
    const name = customers.find(customer => customer.id === parent.entityId)?.name;
    const who = name === undefined ? `（${parent.entityId}）` : `「${name}」`;
    return [`订单被远端拒绝：它的客户${who}已不在远端。拉取之后，这位客户也会从本机消失。`];
  });
}

/**
 * 一轮推送的结果
 *
 * @param result - `syncManager.push()` 的结果
 * @returns 推上去与被拒的条数；有仓库失败时按实体报出原因
 */
export function describePushOutcome(result: PushResult): SyncOutcome {
  if (result.failures.length > 0)
    return { notice: null, error: `推送没有全部完成：${describeFailures(result.failures)}` };
  const rejected = result.rejected > 0 ? `，被拒 ${result.rejected} 条（见「被拒的推送」）` : '';
  return { notice: `推送完成：推上去 ${result.pushed} 条${rejected}`, error: null };
}

/**
 * 一轮拉取的结果
 *
 * @param result - `syncManager.pull()` 的结果
 * @returns 拉到的条数；有仓库失败时按实体报出原因
 */
export function describePullOutcome(result: PullResult): SyncOutcome {
  if (result.failures.length > 0)
    return { notice: null, error: `拉取没有全部完成：${describeFailures(result.failures)}` };
  return { notice: `拉取完成：拉到 ${result.pulled} 条`, error: null };
}

/** 按实体列出失败原因；整机推拉的失败总带着仓库，个别没有仓库的只报原因 */
function describeFailures(failures: readonly SyncFailure[]): string {
  return failures
    .map(failure => {
      const reason = getErrorMessage(failure.error, '未知错误');
      return failure.repository ? `${failure.repository.entity}：${reason}` : reason;
    })
    .join('；');
}

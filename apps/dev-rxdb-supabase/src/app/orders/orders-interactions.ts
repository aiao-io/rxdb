import type { SyncRejection } from '@aiao/rxdb';
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
 * 客户的证件
 *
 * @param customer - 客户
 * @param cards - 本机的证件
 * @returns 客户指向、而且指回这位客户的那张证件；客户没有证件、证件不在本机，或两边的引用对不上时为 `undefined`
 *
 * @remarks
 * 客户与证件互相持有外键（US-038）：两边都对得上才算这位客户的证件，页面上看到证件号就说明两行一致。
 */
export function idCardOf<T extends { readonly id: string; readonly ownerId: string }>(
  customer: { readonly id: string; readonly idCardId: string | null },
  cards: readonly T[]
): T | undefined {
  if (!customer.idCardId) return undefined;
  return cards.find(card => card.id === customer.idCardId && card.ownerId === customer.id);
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

import { junctionEntityId, type RxDBChange, type SyncRejection } from '@aiao/rxdb';
import { ORDER_ITEM_CATEGORY_JUNCTION, type DemoOrderItem } from './order-entities';

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
 * 按父行分组：订单项按订单、订单按客户
 *
 * @param rows - 子行
 * @param parentOf - 子行指向的父行 id
 * @returns 父行 id → 它的子行，组内保持原顺序
 */
export function groupBy<T>(rows: readonly T[], parentOf: (row: T) => string): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const parent = parentOf(row);
    grouped.set(parent, [...(grouped.get(parent) ?? []), row]);
  }
  return grouped;
}

/** 一行还没推送的是什么修改 */
export type PendingKind = 'INSERT' | 'UPDATE';

/**
 * 还没推送的行
 *
 * @param histories - 待推送清单（`versionManager.pushableHistories$`），最新在前
 * @returns 实体 id → 新建还是修改。新建之后又改过的仍算新建；删掉的行本机已经没有，不在里面
 *
 * @remarks
 * 只认 id：演示的主键都是 uuid，几张表之间不会重。
 */
export function pendingRows(
  histories: readonly { readonly changes: readonly Pick<RxDBChange, 'entityId' | 'type'>[] }[]
): ReadonlyMap<string, PendingKind> {
  const pending = new Map<string, PendingKind>();
  for (const { entityId, type } of histories.flatMap(item => item.changes)) {
    if (type === 'DELETE') continue;
    const id = String(entityId);
    pending.set(id, pending.get(id) === 'INSERT' ? 'INSERT' : type);
  }
  return pending;
}

/**
 * 订单项挂一个分类的那一行关联的 id
 *
 * @param itemId - 订单项
 * @param categoryId - 分类
 * @returns 与 RxDB 派生的关联行 id 一致（US-228）：同一对不管谁先挂、在哪个客户端挂都是同一个 id
 *
 * @remarks
 * 中间表与两端外键名同 `supabase/orders-demo.sql`。页面拿它在 {@link pendingRows} 里查这个分类挂上之后推没推。
 */
export function attachmentId(itemId: string, categoryId: string): string {
  return junctionEntityId({ namespace: 'public', name: ORDER_ITEM_CATEGORY_JUNCTION }, [
    { foreignKey: 'orderItemsId', id: itemId, uuid: true },
    { foreignKey: 'categoriesId', id: categoryId, uuid: true }
  ]);
}

/** 一组示例数据：带证件的客户、他的一张订单与订单项 */
export interface OrderTreeDraft {
  readonly customerName: string;
  readonly idCardCode: string;
  readonly orderNumber: string;
  readonly items: readonly OrderItemDraft[];
}

/** {@link OrderTreeDraft} 定下 id 之后的各行，外键都已填好；`Id` 是 id 的类型，本机写入用 RxDB 的 `UUID` */
export interface OrderTreeRows<Id extends string = string> {
  readonly customer: { readonly id: Id; readonly name: string; readonly idCardId: Id };
  readonly idCard: { readonly id: Id; readonly code: string; readonly ownerId: Id };
  readonly order: { readonly id: Id; readonly number: string; readonly customerId: Id };
  readonly items: readonly (OrderItemDraft & { readonly id: Id; readonly orderId: Id })[];
}

const SAMPLE_ITEMS: readonly OrderItemDraft[] = [
  { productName: '耳机', quantity: 2, price: 99 },
  { productName: '手环', quantity: 1, price: 199 }
];

/**
 * 一组示例数据
 *
 * @param customerLabel - 客户名的前半，如「示例客户」「远端客户」
 * @param suffix - 这一组共用的后缀：多次生成不重名，也认得出哪几行是一组
 * @returns 带证件的客户、一张订单与两条订单项
 */
export function orderTreeDraft(customerLabel: string, suffix: string): OrderTreeDraft {
  return {
    customerName: `${customerLabel} ${suffix}`,
    idCardCode: `ID-${suffix}`,
    orderNumber: `SO-${suffix}`,
    items: SAMPLE_ITEMS
  };
}

/**
 * 先给一组示例的各行定下 id、填好外键
 *
 * @param draft - 一组示例
 * @param newId - 生成新 id
 * @returns 客户与证件互相引用，订单指向客户，订单项指向订单
 *
 * @remarks
 * 本机一次 `saveMany` 写下全部行（本地外键到提交时才检查）；远端按父在前逐张表写，见 `orders-remote.ts`。
 */
export function orderTreeRows<Id extends string>(draft: OrderTreeDraft, newId: () => Id): OrderTreeRows<Id> {
  const customerId = newId();
  const idCardId = newId();
  const orderId = newId();
  return {
    customer: { id: customerId, name: draft.customerName, idCardId },
    idCard: { id: idCardId, code: draft.idCardCode, ownerId: customerId },
    order: { id: orderId, number: draft.orderNumber, customerId },
    items: draft.items.map(item => ({ id: newId(), ...item, orderId }))
  };
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

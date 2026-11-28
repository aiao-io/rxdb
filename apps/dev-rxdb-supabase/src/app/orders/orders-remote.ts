import type { SupabaseClient } from '@supabase/supabase-js';
import { ORDER_ITEM_CATEGORY_JUNCTION } from './order-entities';
import type { OrderTreeRows } from './orders-interactions';

/** 远端读写用到的客户端能力子集 */
export type OrdersRemoteClient = Pick<SupabaseClient, 'from'>;

/** 远端的一位客户 */
export interface RemoteCustomer {
  readonly id: string;
  readonly name: string;
  readonly idCardId: string | null;
}

/** 远端的一张证件 */
export interface RemoteIdCard {
  readonly id: string;
  readonly code: string;
  readonly ownerId: string;
}

/** 远端的一张订单 */
export interface RemoteOrder {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
}

/** 远端的一条订单项 */
export interface RemoteOrderItem {
  readonly id: string;
  readonly productName: string;
  readonly quantity: number;
  readonly price: number;
  readonly orderId: string;
}

/** 远端的一个分类 */
export interface RemoteCategory {
  readonly id: string;
  readonly name: string;
}

/** 远端中间表的一行：订单项挂着一个分类 */
export interface RemoteAttachment {
  readonly id: string;
  readonly categoriesId: string;
  readonly orderItemsId: string;
}

/** 远端订单演示六张表此刻的样子 */
export interface OrdersRemoteSnapshot {
  readonly customers: readonly RemoteCustomer[];
  readonly idCards: readonly RemoteIdCard[];
  readonly orders: readonly RemoteOrder[];
  readonly items: readonly RemoteOrderItem[];
  readonly categories: readonly RemoteCategory[];
  readonly attachments: readonly RemoteAttachment[];
}

interface Result<T> {
  readonly data: T | null;
  readonly error: { message: string } | null;
}

function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('Supabase 没有返回数据');
  return result.data;
}

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/** 删、改一行都没碰到时不报错、只是零行：当成失败报出来，免得界面上像什么都没发生 */
function expectAffected(result: Result<unknown[]>): void {
  if (unwrap(result).length === 0) throw new Error('这一行已经不在远端了，刷新看看');
}

/**
 * 读远端订单演示的六张表
 *
 * @param client - 当前身份的 Supabase 客户端
 * @returns 各表全部的行，按建立先后排
 * @throws 任一张表读不到：访客（anon）没有这些表的权限
 *
 * @remarks
 * 直接查业务表，不经同步：看的是推送之后远端真正落下了什么、外键级联删掉了什么。已登录身份共享全部行（RLS）。
 */
export async function fetchOrdersSnapshot(client: OrdersRemoteClient): Promise<OrdersRemoteSnapshot> {
  const [customers, idCards, orders, items, categories, attachments] = await Promise.all([
    client.from('demo_customers').select('id, name, idCardId').order('createdAt').order('id'),
    client.from('demo_id_cards').select('id, code, ownerId').order('createdAt').order('id'),
    client.from('demo_orders').select('id, number, customerId').order('createdAt').order('id'),
    client.from('demo_order_items').select('id, productName, quantity, price, orderId').order('createdAt').order('id'),
    client.from('demo_categories').select('id, name').order('createdAt').order('id'),
    client.from(ORDER_ITEM_CATEGORY_JUNCTION).select('id, categoriesId, orderItemsId').order('createdAt').order('id')
  ]);
  return {
    customers: unwrap(customers),
    idCards: unwrap(idCards),
    orders: unwrap(orders),
    items: unwrap(items),
    categories: unwrap(categories),
    attachments: unwrap(attachments)
  };
}

/**
 * 在远端删一位客户，模拟别人删了他
 *
 * @param client - 当前身份的 Supabase 客户端
 * @param id - 客户 id
 *
 * @remarks
 * 远端外键级联删掉他的证件、订单、订单项与分类关联，同步触发器把这些删除都记进日志（US-224 的触发器模式），
 * 拉取时本机跟着删。日志不带本机的 clientId，所以本机拉得到，像是别人删的。
 */
export async function deleteRemoteCustomer(client: OrdersRemoteClient, id: string): Promise<void> {
  expectAffected(await client.from('demo_customers').delete().eq('id', id).select('id'));
}

/**
 * 在远端删一张订单，模拟别人删了它；订单项随之级联删除
 *
 * @param client - 当前身份的 Supabase 客户端
 * @param id - 订单 id
 */
export async function deleteRemoteOrder(client: OrdersRemoteClient, id: string): Promise<void> {
  expectAffected(await client.from('demo_orders').delete().eq('id', id).select('id'));
}

/**
 * 在远端新建一组客户、证件、订单与订单项，模拟别人推送上来
 *
 * @param client - 当前身份的 Supabase 客户端
 * @param rows - 定好 id、填好外键的各行
 *
 * @remarks
 * 父在前逐张表写。客户与证件互相持有外键、都不是 DEFERRABLE：客户先不带证件引用，证件写好之后再补上——
 * 与推送时同步层断环的做法一样（US-038），只是这里分几次请求。中途失败时已经写下的行留在远端，面板刷新后看得到。
 */
export async function createRemoteOrderTree(client: OrdersRemoteClient, rows: OrderTreeRows): Promise<void> {
  const { idCardId, ...customer } = rows.customer;
  check(await client.from('demo_customers').insert(customer));
  check(await client.from('demo_id_cards').insert(rows.idCard));
  expectAffected(await client.from('demo_customers').update({ idCardId }).eq('id', customer.id).select('id'));
  check(await client.from('demo_orders').insert(rows.order));
  check(await client.from('demo_order_items').insert([...rows.items]));
}

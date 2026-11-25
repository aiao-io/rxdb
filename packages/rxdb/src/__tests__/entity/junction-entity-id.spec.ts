/**
 * @fileoverview 多对多关联行的确定性 id（US-228 AC#1）
 *
 * @remarks
 * 黄金向量由 Python `uuid.uuid5` 独立算出，并与 Postgres `extensions.uuid_generate_v5` 核对过同值：
 * 公式一旦变了，已经落库、已经推上远端的关联行就再也对不上，这里把它钉死。
 */
import { describe, expect, it } from 'vitest';
import { JUNCTION_ID_NAMESPACE, junctionEntityId } from '../../entity/many-to-many-entity.js';
import { RxDBError } from '../../RxDBError.js';

const CATEGORY = '0195b3e2-8a11-7c3d-9f00-000000000001';
const ORDER_ITEM = '0195b3e2-8a11-7c3d-9f00-000000000002';
const OTHER_ORDER_ITEM = '0195b3e2-8a11-7c3d-9f00-000000000003';
const SHOP_JUNCTION = { namespace: 'shop', name: 'Category_OrderItem' };

const ends = (category: string, orderItem: string) =>
  [
    { foreignKey: 'categoriesId', id: category, uuid: true },
    { foreignKey: 'orderItemsId', id: orderItem, uuid: true }
  ] as const;

describe('junctionEntityId（US-228）', () => {
  it('黄金向量：uuid v5，命名空间是固定的协议常量，名字按外键属性名排序拼接', () => {
    expect(JUNCTION_ID_NAMESPACE).toBe('9fb02b21-84d4-40f2-8847-bb5c3878b0e0');
    expect(junctionEntityId(SHOP_JUNCTION, ends(CATEGORY, ORDER_ITEM))).toBe('13f88891-b5bd-5d5f-af0c-65d4564cbb79');
    expect(junctionEntityId(SHOP_JUNCTION, ends(CATEGORY, OTHER_ORDER_ITEM))).toBe(
      'f83fe96f-8d69-5f52-876c-a08c73b68e05'
    );
    expect(
      junctionEntityId({ namespace: 'public', name: 'DemoCategory_DemoOrderItem' }, [
        { foreignKey: 'categoriesId', id: 'c0ffee00-0000-4000-8000-000000000001', uuid: true },
        { foreignKey: 'orderItemsId', id: 'c0ffee00-0000-4000-8000-000000000002', uuid: true }
      ])
    ).toBe('e250c398-8b9a-57ab-a471-a6eb7fe8f0ab');
  });

  it('与从哪一端算无关：两端交换顺序得到同一个 id；不同的一对 id 不同', () => {
    const [category, orderItem] = ends(CATEGORY, ORDER_ITEM);
    expect(junctionEntityId(SHOP_JUNCTION, [orderItem, category])).toBe(
      junctionEntityId(SHOP_JUNCTION, [category, orderItem])
    );
    expect(junctionEntityId(SHOP_JUNCTION, ends(CATEGORY, ORDER_ITEM))).not.toBe(
      junctionEntityId(SHOP_JUNCTION, ends(CATEGORY, OTHER_ORDER_ITEM))
    );
    expect(junctionEntityId({ namespace: 'other', name: 'Category_OrderItem' }, ends(CATEGORY, ORDER_ITEM))).not.toBe(
      junctionEntityId(SHOP_JUNCTION, ends(CATEGORY, ORDER_ITEM))
    );
  });

  it('uuid 主键不分大小写（SQLite 按 TEXT 存、区分大小写）；非 uuid 主键按十进制文本参与', () => {
    expect(junctionEntityId(SHOP_JUNCTION, ends(CATEGORY.toUpperCase(), ORDER_ITEM.toUpperCase()))).toBe(
      '13f88891-b5bd-5d5f-af0c-65d4564cbb79'
    );
    const numeric = junctionEntityId({ namespace: 'graph', name: 'Node_Node' }, [
      { foreignKey: 'linksId', id: 7, uuid: false },
      { foreignKey: 'linkedById', id: 42n, uuid: false }
    ]);
    expect(numeric).toBe('c3673fa4-dd79-5894-ae2e-8a01fda34491');
    expect(
      junctionEntityId({ namespace: 'graph', name: 'Node_Node' }, [
        { foreignKey: 'linksId', id: '7', uuid: false },
        { foreignKey: 'linkedById', id: '42', uuid: false }
      ])
    ).toBe(numeric);
    expect(
      junctionEntityId({ namespace: 'graph', name: 'Node_Node' }, [
        { foreignKey: 'linksId', id: 'Ab', uuid: false },
        { foreignKey: 'linkedById', id: '42', uuid: false }
      ])
    ).not.toBe(
      junctionEntityId({ namespace: 'graph', name: 'Node_Node' }, [
        { foreignKey: 'linksId', id: 'ab', uuid: false },
        { foreignKey: 'linkedById', id: '42', uuid: false }
      ])
    );
  });

  it('缺任一端的 id、或两端外键同名时直接抛错，不拿残缺的名字去算', () => {
    const [category] = ends(CATEGORY, ORDER_ITEM);
    for (const id of [undefined, null, '']) {
      expect(() =>
        junctionEntityId(SHOP_JUNCTION, [category, { foreignKey: 'orderItemsId', id: id as never, uuid: true }])
      ).toThrow(RxDBError);
    }
    expect(() => junctionEntityId(SHOP_JUNCTION, [category, { ...category }])).toThrow(RxDBError);
  });
});

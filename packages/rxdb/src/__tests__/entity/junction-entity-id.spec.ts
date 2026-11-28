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

  // 评审 F5：主键原样拼进名字时，`|<外键>=` 出现在主键里就分不清两端的边界，两对不同的数据算出同一个 id。
  // 下面的黄金向量由 Postgres `extensions.uuid_generate_v5` 按文档里带 `replace` 的服务端公式算出
  describe('主键里带分隔符', () => {
    const pair = (category: string, orderItem: string) =>
      junctionEntityId(SHOP_JUNCTION, [
        { foreignKey: 'categoriesId', id: category, uuid: false },
        { foreignKey: 'orderItemsId', id: orderItem, uuid: false }
      ]);

    it('两对不同的端点拼出同一段文本时也得到两个 id：主键里的 % 与 | 先转义', () => {
      expect(pair('a|orderItemsId=b', 'c')).toBe('a89682a8-7fb6-563a-9113-0fcd45dc9a19');
      expect(pair('a', 'b|orderItemsId=c')).toBe('18deedb3-5844-52fb-a96a-12df7ad377e6');
      expect(pair('100%', 'c')).toBe('e0f6fc7b-f066-5c54-a348-a9f37f5eafdd');
    });

    it('转义本身不撞：字面的 %7C、%25 与原字符是不同的主键', () => {
      expect(pair('a%7C', 'c')).not.toBe(pair('a|', 'c'));
      expect(pair('a%25', 'c')).not.toBe(pair('a%', 'c'));
    });

    it('不含 % 与 | 的主键名字逐字不变：已经落库的关联行不用迁移', () => {
      expect(pair('a', 'c')).toBe('febd125d-756f-50ef-967e-53064e5c320b');
    });
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

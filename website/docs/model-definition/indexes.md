# 实体索引

索引配置简洁明了，当前代码支持两种声明方式：

- 单字段唯一：直接在属性上写 `unique: true`
- 多字段索引 / 多字段唯一：在实体的 `indexes` 里声明

## 单字段唯一

单字段唯一不需要额外写 `indexes`：

```ts
{
  name: 'number',
  type: PropertyType.string,
  unique: true
}
```

相比额外定义单字段 `indexes`，此方式更为简洁。

## 组合索引

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Order',
  properties: [
    { name: 'storeId', type: PropertyType.uuid },
    { name: 'buyerId', type: PropertyType.uuid },
    { name: 'number', type: PropertyType.string }
  ],
  indexes: [
    {
      name: 'idx_order_store_buyer',
      properties: ['storeId', 'buyerId']
    },
    {
      name: 'uk_order_store_number',
      unique: true,
      properties: ['storeId', 'number']
    }
  ]
})
export class Order extends EntityBase {}
```

## 索引选项

当前 `EntityIndexMetadataOptions` 支持的核心字段是：

- `name`：索引名
- `displayName`：显示名，可选
- `unique`：是否唯一
- `properties`：字段数组

其中最重要的是 `properties` 的顺序。组合索引不是集合，而是有顺序的列前缀。

## 什么时候该建索引

- 某个字段会被频繁精确查询时
- 某组字段会一起作为过滤条件时
- 某组字段要一起保证唯一时

## 不建议创建索引的场景

- 仅偶尔查询的字段
- 频繁写入但几乎不查询的字段
- 只需单字段唯一，却额外定义重复组合索引

## 命名建议

当前代码不强制命名规范，但建议统一：

- 普通索引：`idx_{entity}_{fields}`
- 唯一索引：`uk_{entity}_{fields}`

例如：

- `idx_order_store_buyer`
- `uk_order_store_number`

## 建议

- 单字段唯一优先在属性上声明
- 多字段约束使用 `indexes`
- `properties` 顺序按最常见查询模式排列
- 跨表约束不属于索引职责，由业务层或关系约束层处理

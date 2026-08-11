# 实体属性

属性定义描述的是“这一列存什么、能不能空、是否唯一、有没有默认值、数据库列名叫什么”。

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Product',
  displayName: '商品',
  properties: [
    {
      name: 'title',
      type: PropertyType.string,
      displayName: '标题',
      required: true,
      sortable: true
    },
    {
      name: 'status',
      type: PropertyType.enum,
      enum: ['draft', 'published', 'archived'],
      default: 'draft'
    },
    {
      name: 'productName',
      columnName: 'product_name',
      type: PropertyType.string,
      displayName: '数据库蛇形列名示例'
    }
  ]
})
export class Product extends EntityBase {}
```

## EntityBase 自动提供的字段

继承 `EntityBase` 后，无需重复声明这些字段：

- `id`：`uuid` 主键，默认自动生成
- `createdAt`：`date`，默认 `() => new Date()`
- `updatedAt`：`date`，默认 `() => new Date()`
- `createdBy`：可空字符串
- `updatedBy`：可空字符串

## 支持的属性类型

| 类型          | 说明            | 关键补充                                               |
| ------------- | --------------- | ------------------------------------------------------ |
| `uuid`        | UUID 字符串     | 可设 `primary: true`                                   |
| `string`      | 字符串          | 可设 `primary: true`                                   |
| `enum`        | 枚举字符串      | 必须额外提供 `enum: readonly string[]`                 |
| `number`      | 数字            | 支持默认值                                             |
| `integer`     | 整数            | 可设 `primary: true`                                   |
| `bigint`      | 64 位有符号整数 | 运行时使用 `bigint`，可设 `primary: true`              |
| `boolean`     | 布尔值          | 支持默认值                                             |
| `date`        | 日期            | 默认值可写 `Date`、`() => Date` 或 `CURRENT_TIMESTAMP` |
| `binary`      | 二进制字节      | 运行时使用 `Uint8Array`                                |
| `stringArray` | 字符串数组      | 适合标签等场景                                         |
| `numberArray` | 数字数组        | 适合简单数值集合                                       |
| `keyValue`    | 扁平键值对象    | 不支持嵌套，不支持数组                                 |
| `json`        | 任意 JSON       | 支持嵌套对象和数组，默认不用于结构化搜索               |

## 通用属性选项

这些选项来自当前代码中的 `IEntityObject`、`ISortable` 和具体属性类型定义：

| 选项          | 说明                                    |
| ------------- | --------------------------------------- |
| `name`        | 字段名，运行时属性名                    |
| `columnName`  | 数据库列名，不写时默认等于 `name`       |
| `displayName` | 展示名                                  |
| `unique`      | 唯一约束，单字段唯一时优先用它          |
| `readonly`    | 更新时忽略该字段                        |
| `nullable`    | 数据库层允许 `NULL`                     |
| `required`    | 前端校验层必填，不等于数据库 `NOT NULL` |
| `sortable`    | 查询层允许排序                          |
| `default`     | 默认值，支持常量或函数                  |
| `primary`     | 仅部分类型支持，标记主键                |

### `required` 和 `nullable` 的区别

- `required: true`：偏向表单/输入校验，空字符串、空数组也会被视为无效
- `nullable: false`：偏向存储约束，表示数据库列不允许为 `NULL`

这两个选项可以同时使用，也可以只使用其中之一，不应将二者混用。

## 常见写法

### 1. 数据库列名与代码字段名分离

```ts
{
  name: 'productName',
  columnName: 'product_name',
  type: PropertyType.string,
  displayName: '商品名称'
}
```

### 2. 枚举字段

```ts
{
  name: 'status',
  type: PropertyType.enum,
  enum: ['draft', 'published', 'archived'],
  default: 'draft'
}
```

### 3. 函数默认值

```ts
{
  name: 'publishedAt',
  type: PropertyType.date,
  nullable: true,
  default: () => new Date()
}
```

### 4. `keyValue` 类型

`keyValue` 是“扁平键值对象”，内部键需要单独声明结构：

```ts
{
  name: 'attrs',
  type: PropertyType.keyValue,
  properties: [
    { name: 'brand', type: PropertyType.string, required: true },
    { name: 'weight', type: PropertyType.number },
    { name: 'fragile', type: PropertyType.boolean, default: false }
  ]
}
```

如果你需要嵌套对象、数组或更自由的结构，应该改用 `json`。

### 5. `bigint` 与 `binary`

`bigint` 只接受 JavaScript `bigint`，存储范围为 `-2^63` 到 `2^63 - 1`。不要传入
`number` 或字符串；即使数值看起来相同，适配器也会在执行 SQL 前拒绝隐式转换。

```ts
{
  name: 'sequence',
  type: PropertyType.bigint,
  default: 0n,
  sortable: true
}
```

`binary` 只接受 `Uint8Array`。保存 `source.subarray(start, end)` 时只处理当前视图内的
字节，不会扩大到整个 backing buffer；默认值和持久化边界也会复制字节，避免多个实体或
调用方共享同一份可变数组。

```ts
{
  name: 'payload',
  type: PropertyType.binary,
  default: () => new Uint8Array()
}
```

`Uint8Array` 的原地修改不会触发实体变更追踪。修改字节后必须重新赋值，再调用 `save()`：

```ts
const nextPayload = new Uint8Array(entity.payload);
nextPayload[0] = 0xff;
entity.payload = nextPayload;
await entity.save();
```

`binary` 不支持主键、关系外键、范围比较、LIKE 或排序。需要这些能力时应单独保存可查询的
标量元数据。

## 计算属性

当前代码还支持 `computedProperties`。这类字段：

- 只读
- 不直接落库
- 由特性或运行时逻辑提供

树结构基类里的 `hasChildren` 就是一个真实例子。

```ts
computedProperties: [
  {
    name: 'hasChildren',
    type: PropertyType.boolean,
    readonly: true,
    nullable: true
  }
];
```

## 建议

- 单字段唯一直接用 `unique: true`
- 需要兼容旧库列名时使用 `columnName`
- 动态结构优先区分 `keyValue` 和 `json`，不要混用
- 需要排序的字段再开启 `sortable`

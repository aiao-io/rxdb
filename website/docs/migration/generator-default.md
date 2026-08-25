# 生成器 `default` 语义迁移

`@aiao/rxdb-client-generator` 序列化实体元数据的方式变了：过去先做一次 `JSON.stringify` / `JSON.parse` 往返再渲染，现在直接按运行时类型分派。

这是一次**破坏性变更**。它修的是四个静默缺陷，代价是一类过去"能生成"的声明现在会在生成期报错——报错正是本次变更的目的：那些声明生成出来的客户端本来就是错的。

## 行为变化

| 声明的 `default`                | 变更前                                                  | 变更后                                      |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `7n`（bigint）                  | 崩在 `TypeError: Do not know how to serialize a BigInt` | 输出 `7n`                                   |
| `new Uint8Array([1, 2])`        | 塌成 `{ "0": 1, "1": 2 }`，字节视图丢失                 | 输出 `new Uint8Array([1, 2])`               |
| `new Date('2024-01-02')`        | 变成 ISO 字符串，与手写字符串不可区分                   | 输出 `new Date("2024-01-02T00:00:00.000Z")` |
| `'CURRENT_TIMESTAMP'`           | 字符串                                                  | 字符串（不变）                              |
| `() => uuid()` 等函数           | **键被静默丢弃**，生成的实体没有默认值                  | 生成期抛错 `unsupportedDefaultFactory`      |
| `NaN` / `Infinity`              | 静默变成 `null`                                         | 生成期抛错 `unsupportedDefaultValue`        |
| 非法 `Date`、循环引用、`Map` 等 | 塌成 `{}` 或字符串                                      | 生成期抛错 `unsupportedDefaultValue`        |

`Uint8Array` 只取**当前视图**的字节：`new Uint8Array([1,2,3,4,5]).subarray(1, 3)` 生成 `new Uint8Array([2, 3])`，不含底层 buffer 的其余部分。

显式写成 `default: undefined` 的键仍然按"没有默认值"处理并跳过，不报错——这一条语义没有变化。

## 遇到 `unsupportedDefaultFactory` 怎么改

生成器拿不到函数的闭包与 import 环境，任何"还原源码"的做法都是猜测，因此不做。按你的场景选等价物：

| 原写法                                          | 迁移到                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 主键 `id: { default: () => uuid() }`            | 删掉这条声明，改为继承 `EntityBase`。主键默认值由运行时基类提供，本就不经生成器                  |
| `createdAt` / `updatedAt` 的 `() => new Date()` | 同上继承 `EntityBase`；需要由库侧生成时写 `default: 'CURRENT_TIMESTAMP'`                         |
| 业务日期字段的 `() => new Date()`               | `default: 'CURRENT_TIMESTAMP'`，由适配器求值                                                     |
| 业务字段 `() => uuid()` 等每次不同的值          | 移到创建接口显式赋值，或放进 repository 的 create 钩子。"每次调用产生新值"在静态元数据里不可表达 |
| 读取外部配置的闭包                              | 移到创建接口。生成期拿不到闭包环境，任何还原都是猜测                                             |

继承 `EntityBase` 的实体**不受影响**：序列化只走实体自身声明的 `properties` / `computedProperties` / `relations`，基类那三个函数默认值不在其中。

关系上的 `default`（1:1 与 m:1）适用同一张表，错误信息里的字段名就是关系名。

## 错误信息怎么读

```text
unsupportedDefaultFactory: entity "Article" field "slug" (at metadata.properties[2].default) holds a function.
Replace it with a constant, 'CURRENT_TIMESTAMP', or assign the value when creating the record.
```

实体名、字段名与键路径都在信息里。函数体**不会**被打印——错误信息里出现整段源码既没用也可能泄漏业务逻辑。

> 相关：[版本与 API 稳定性策略](../versioning.md)、[客户端代码生成](../client-generator.md)

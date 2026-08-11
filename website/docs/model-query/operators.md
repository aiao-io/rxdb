# 查询操作符

RxDB 使用统一的 `RuleGroup` 结构描述查询条件。

## 基础结构

```ts
interface Rule<T = any, K extends keyof T = keyof T> {
  field: K;
  operator: OperatorName;
  value?: any;
  where?: RuleGroup<any>;
}

interface RuleGroup<T = any> {
  combinator: 'and' | 'or';
  rules: Array<RuleGroup<T> | Rule<T>>;
}
```

## 操作符分类

- 比较：`=`、`!=`、`<`、`>`、`<=`、`>=`
- 集合：`in`、`notIn`
- 区间：`between`、`notBetween`
- 字符串：`contains`、`notContains`、`startsWith`、`notStartsWith`、`endsWith`、`notEndsWith`
- 存在性：`exists`、`notExists`

## 基础示例

```ts
const where = {
  combinator: 'and',
  rules: [
    { field: 'completed', operator: '=', value: false },
    { field: 'title', operator: 'contains', value: keyword }
  ]
} as const;
```

## 嵌套组合

```ts
const where = {
  combinator: 'and',
  rules: [
    { field: 'completed', operator: '=', value: false },
    {
      combinator: 'or',
      rules: [
        { field: 'priority', operator: '=', value: 'high' },
        { field: 'dueDate', operator: '<=', value: new Date() }
      ]
    }
  ]
} as const;
```

## 关系字段

```ts
const where = {
  combinator: 'and',
  rules: [{ field: 'owner.name', operator: 'startsWith', value: 'A' }]
};
```

## `exists` / `notExists` 的正确写法

这里不要再把子查询条件塞进 `value`。当前实现的正确结构是 `where`：

```ts
const where = {
  combinator: 'and',
  rules: [
    {
      field: 'children',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'enabled', operator: '=', value: true }]
      }
    }
  ]
};
```

## null 判断

```ts
{ field: 'parentId', operator: '=', value: null }
{ field: 'email', operator: '!=', value: null }
```

## 参考

- [exists-operator](./exists-operator.md)
- [find](./find.md)

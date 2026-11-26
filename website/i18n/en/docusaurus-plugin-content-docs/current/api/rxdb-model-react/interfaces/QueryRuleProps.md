# QueryRuleProps

Defined in: [packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx#L26)

Props of [QueryRule](../functions/QueryRule.md).

## Properties

### errors? \{#errors\}

```ts
errors?: ValidationError[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx#L32)

List of validation errors.

***

### fields \{#fields\}

```ts
fields: FieldMetadata[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx#L30)

Field list.

***

### onRemove? \{#onremove\}

```ts
onRemove?: () => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx#L36)

Remove the rule.

#### Returns

`void`

***

### onUpdate? \{#onupdate\}

```ts
onUpdate?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx#L34)

Rule update.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `id`: `string`; `updates`: `Partial`&lt;[`UIRuleWithWhere`](../type-aliases/UIRuleWithWhere.md)&gt;; \} |
| `event.id` | `string` |
| `event.updates` | `Partial`&lt;[`UIRuleWithWhere`](../type-aliases/UIRuleWithWhere.md)&gt; |

#### Returns

`void`

***

### rule \{#rule\}

```ts
rule: UIRuleWithWhere;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-rule/query-rule.tsx#L28)

Rule.

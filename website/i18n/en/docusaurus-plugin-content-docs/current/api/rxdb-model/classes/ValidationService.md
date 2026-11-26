# ValidationService

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L101)

Validation service
Validates QueryBuilder rules and values

## Constructors

### Constructor

```ts
new ValidationService(options?): ValidationService;
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L107)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`ValidationServiceOptions`](../interfaces/ValidationServiceOptions.md) | Validation service config (custom rules, etc.) |

#### Returns

`ValidationService`

## Methods

### getRules() \{#getrules\}

```ts
getRules(): ValidationRule[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L274)

Gets all validation rules

#### Returns

[`ValidationRule`](../interfaces/ValidationRule.md)[]

***

### registerRule() \{#registerrule\}

```ts
registerRule(rule): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L260)

Registers a custom validation rule

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rule` | [`ValidationRule`](../interfaces/ValidationRule.md) |

#### Returns

`void`

***

### unregisterRule() \{#unregisterrule\}

```ts
unregisterRule(name): boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L267)

Removes a validation rule

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`boolean`

***

### validateGroup() \{#validategroup\}

```ts
validateGroup(group, fields): ValidationResult;
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L224)

Validates a whole rule group

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `group` | [`ValidationGroupInput`](../type-aliases/ValidationGroupInput.md) |
| `fields` | `Map`&lt;`string`, [`FieldMetadata`](../interfaces/FieldMetadata.md)&gt; |

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

***

### validateRule() \{#validaterule\}

```ts
validateRule(rule, field): ValidationResult;
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L124)

Validates a single rule

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rule` | `ValidationRuleInput` |
| `field` | [`FieldMetadata`](../interfaces/FieldMetadata.md) |

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

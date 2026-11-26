# ValidationService

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:50

Validation service
Validates QueryBuilder rules and values

## Constructors

### Constructor

```ts
new ValidationService(options?): ValidationService;
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:55

#### Parameters

| Parameter  | Type                                                                    | Description                                           |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `options?` | [`ValidationServiceOptions`](../interfaces/ValidationServiceOptions.md) | Validation service configuration (custom rules, etc.) |

#### Returns

`ValidationService`

## Methods

### getRules() \{#getrules\}

```ts
getRules(): ValidationRule[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:75

Gets all validation rules

#### Returns

[`ValidationRule`](../interfaces/ValidationRule.md)[]

---

### registerRule() \{#registerrule\}

```ts
registerRule(rule): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:67

Registers a custom validation rule

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `rule`    | [`ValidationRule`](../interfaces/ValidationRule.md) |

#### Returns

`void`

---

### unregisterRule() \{#unregisterrule\}

```ts
unregisterRule(name): boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:71

Removes a validation rule

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`boolean`

---

### validateGroup() \{#validategroup\}

```ts
validateGroup(group, fields): ValidationResult;
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:63

Validates the whole rule group

#### Parameters

| Parameter | Type                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `group`   | [`ValidationGroupInput`](../type-aliases/ValidationGroupInput.md)        |
| `fields`  | `Map`&lt;`string`, [`FieldMetadata`](../interfaces/FieldMetadata.md)&gt; |

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

---

### validateRule() \{#validaterule\}

```ts
validateRule(rule, field): ValidationResult;
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:59

Validates a single rule

#### Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `rule`    | `ValidationRuleInput`                             |
| `field`   | [`FieldMetadata`](../interfaces/FieldMetadata.md) |

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

# ValidationRule

Defined in: packages/rxdb-model/dist/query-builder/models/validation.interface.d.ts:6

Validation rule

## Properties

### appliesTo? \{#appliesto\}

```ts
appliesTo?: PropertyType[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/validation.interface.d.ts:14

The field types this rule applies to (optional; undefined means it applies to all types)

---

### message \{#message\}

```ts
message: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/validation.interface.d.ts:18

Error message

---

### messageKey? \{#messagekey\}

```ts
messageKey?: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/validation.interface.d.ts:20

Key in the built-in message catalog.

---

### name \{#name\}

```ts
name: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/validation.interface.d.ts:10

Rule name

---

### validate \{#validate\}

```ts
validate: context => boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/models/validation.interface.d.ts:25

Validation function

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `context` | [`ValidationContext`](ValidationContext.md) |

#### Returns

`boolean`

true means passed, false means failed

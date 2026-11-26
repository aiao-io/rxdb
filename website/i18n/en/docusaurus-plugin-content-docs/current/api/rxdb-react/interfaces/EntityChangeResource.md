---
sidebar_label: 'EntityChangeResource⟨T⟩'
---

# EntityChangeResource`<T>`

Defined in: [rxdb-react/src/use-entity-change.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L35)

Result of bridging entity patches into React rendering.

## Type Parameters

| Type Parameter                    | Description          |
| --------------------------------- | -------------------- |
| <a id="type-parameter-t"></a> `T` | Entity instance type |

## Properties

### error \{#error\}

```ts
readonly error: Error | undefined;
```

Defined in: [rxdb-react/src/use-entity-change.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L46)

Error of the patch stream; reset when the entity or time window changes.

---

### revision \{#revision\}

```ts
readonly revision: number;
```

Defined in: [rxdb-react/src/use-entity-change.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L48)

Number of patches received, starting from `0`; intended for debugging and test assertions.

---

### value \{#value\}

```ts
readonly value: T | undefined;
```

Defined in: [rxdb-react/src/use-entity-change.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L44)

The **same** entity instance that was passed in (not a copy).

#### Remarks

Entities are in-place mutable class instances; the reference does not change across patches, so React's props/state comparison concludes "no change" and skips re-rendering. This hook forces re-renders through the self-incrementing [EntityChangeResource.revision](#revision), so a component gets the latest value as long as it reads entity fields during render.

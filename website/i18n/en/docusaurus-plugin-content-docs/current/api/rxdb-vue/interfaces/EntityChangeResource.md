---
sidebar_label: "EntityChangeResource⟨T⟩"
---

# EntityChangeResource`<T>`

Defined in: [rxdb-vue/src/use-entity-change.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L44)

The result of bridging entity patches into Vue's reactivity system.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | Entity instance type |

## Properties

### error \{#error\}

```ts
readonly error: ComputedRef<Error | undefined>;
```

Defined in: [rxdb-vue/src/use-entity-change.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L57)

Error of the patch stream; reset when the entity switches.

***

### revision \{#revision\}

```ts
readonly revision: ComputedRef<number>;
```

Defined in: [rxdb-vue/src/use-entity-change.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L59)

Number of patches received, counting from `0`; for debugging and test assertions.

***

### value \{#value\}

```ts
readonly value: Readonly<ShallowRef<T | undefined>>;
```

Defined in: [rxdb-vue/src/use-entity-change.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L55)

The **same** entity instance as the input (not a copy); every patch forces dependents to re-evaluate.

#### Remarks

Uses `triggerRef` instead of swapping the reference: entities are mutable-in-place class instances whose reference is unchanged before and after a patch, so any value-comparison-based reactive primitive (`ref` / `computed`) would judge "no change" and skip the re-render. Templates must therefore read the entity through this ref; reading fields of the original instance directly does not re-render. The return value itself is a plain object, and templates only auto-unwrap top-level `Ref`s: destructure it into a top-level binding first (`const { value: todo } = useEntityChange(…)`, and write `todo?.title` in the template); without destructuring you must write `change.value.value?.title`.

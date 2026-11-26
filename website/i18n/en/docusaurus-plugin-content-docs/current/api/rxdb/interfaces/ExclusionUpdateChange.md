# ExclusionUpdateChange

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L35)

The before and after values of an update: `patch` is the new value being written, `inversePatch` is the old value being replaced (both may contain only the changed columns).

## Properties

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: Readonly<Record<string, unknown>> | null;
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L37)

***

### patch \{#patch\}

```ts
readonly patch: Readonly<Record<string, unknown>> | null;
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L36)

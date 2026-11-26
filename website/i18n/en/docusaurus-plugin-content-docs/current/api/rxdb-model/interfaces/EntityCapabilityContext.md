# EntityCapabilityContext

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L23)

Instance-side context for [deriveEntityCapabilities](../functions/deriveEntityCapabilities.md).

## Properties

### readOnly? \{#readonly\}

```ts
readonly readOnly?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L30)

The instance the entity lives in is read-only (`rxdb.readOnly`, e.g. a read-only checkout, US-313): all three capabilities are off.

#### Remarks

All public write entry points of a read-only instance throw `RxDBReadOnlyError`; beyond write controls, only an error is shown.

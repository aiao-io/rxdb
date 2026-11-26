# EntityCapabilityContext

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:14

Instance-side context of [deriveEntityCapabilities](../variables/deriveEntityCapabilities.md).

## Properties

### readOnly? \{#readonly\}

```ts
readonly readOnly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:21

The instance the entity lives in is read-only (`rxdb.readOnly`, e.g. a read-only checkout, US-313): all three capabilities are off.

#### Remarks

Public write entrances of a read-only instance always throw `RxDBReadOnlyError`; interacting with a write control just produces an error.

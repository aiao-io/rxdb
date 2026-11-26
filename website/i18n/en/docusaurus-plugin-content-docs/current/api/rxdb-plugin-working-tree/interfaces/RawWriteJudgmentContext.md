# RawWriteJudgmentContext

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L53)

The judgment context of one raw call.

## Remarks

`domain` is injected — the judgment carries no list of its own. Carrying one would be the second truth spec.md explicitly forbids, and this particular one is
the definition of "which tables are protected", where drift costs a silent pass.

**Not the same thing as the core's `RawWriteContext`, hence the different name.** That one is the **seam** between adapter and core
(a capability bit + a forwarding entry), this one is the **input** of the judgment (the domain). The same name would turn "can the adapter's
object be fed straight to the judgment" into a field-by-field recall question, and both happen to have `capabilityEnabled` —
structural typing would then quietly let things through in some directions.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L55)

Whether this database has the commit capability enabled; when not enabled, step 1 lets it through

***

### domain \{#domain\}

```ts
readonly domain: VersionedDomainView;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L58)

The versioned domain view, the same list as the one from `buildVersionedDomain()`

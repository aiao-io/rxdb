# RawWriteJudgmentContext

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L53)

The judgment context of one raw call

## Remarks

`domain` is injected — the judgment carries no list of its own. Keeping its own copy is the second truth spec.md explicitly forbids, and this particular one is the definition of "which tables are protected"; drift costs silent pass-through.

**Not the same thing as the core's `RawWriteContext`, hence a different name.** That one is the **seam** between the adapter and the core (capability bit + a forwarding entry); this one is the judgment's **input** (the domain). Sharing a name would turn "can what the adapter hands out be fed directly into the judgment" into a field-by-field recollection problem, and both happen to have `capabilityEnabled` — structural typing would then silently pass in some directions.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L55)

Does this database have the commit capability enabled; not enabled means step 1 passes it through

---

### domain \{#domain\}

```ts
readonly domain: VersionedDomainView;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L58)

The versioned domain view, the same list as from `buildVersionedDomain()`

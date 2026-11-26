# RxDBCapabilityVersionKind

Defined in: [packages/rxdb/src/system/migration.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L149)

Which "number" to report to the user on a version mismatch — **the plugin capability's own**.

## Remarks

Capability version numbers are defined by the plugin that contributes them; core cannot enumerate them, nor should it: third-party plugins must also be able to report readable version mismatches, and core cannot pre-enumerate their number names. So this does not enumerate number names — it asks for one extra thing only: **which capability it belongs to**.

It is needed because a number name alone has no ownership: with several plugins installed, "the commit protocol version is wrong" does not point back to which package to upgrade. With the capability name attached, it matches the attribution of `RxDBCapabilityClaim` in `capability-watermark.ts` and the name reported by the "unclaimed capability guard" — one consistent measure across all three places.

## Properties

### capability \{#capability\}

```ts
readonly capability: string;
```

Defined in: [packages/rxdb/src/system/migration.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L151)

The capability name, same value as the `IRxDBPlugin.name` of the plugin that contributes it

***

### kind \{#kind\}

```ts
readonly kind: string;
```

Defined in: [packages/rxdb/src/system/migration.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L154)

The number name within that capability, e.g. `'commit protocol'`; rendered verbatim into the error message

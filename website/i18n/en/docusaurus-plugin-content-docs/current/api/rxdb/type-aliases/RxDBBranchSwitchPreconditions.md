# RxDBBranchSwitchPreconditions

```ts
type RxDBBranchSwitchPreconditions = object;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L120)

Preconditions a caller can state when switching branches

## Remarks

**The shape of the fields lives in the core; the meaning of the fields lives in the capability plugin.** The core
does not read a single field and passes them through unchanged to
[RxDBSystemContribution.prepareBranchSwitch](../interfaces/RxDBSystemContribution.md#preparebranchswitch) — the criterion for
`requireClean` is `WorkingTreeState.entryCount` and the criterion for `expectedActivationRevision` is the activation
row of the working tree; both tables are contributed by `@aiao/rxdb-plugin-working-tree`, and the core does not know
them. This is the same division of labor as [RxDBSystemContribution.version](../interfaces/RxDBSystemContribution.md#version):
the core transports, the plugin interprets.

Then why not let the plugin declare the type itself? Because `switchBranch()` is a method on the **core surface**, and
its parameters must have a shape at the declaration site — turned into a bag of `Record<string, unknown>`, users would
get neither completion nor spelling checks, and these two fields are exactly the kind that "never error when
misspelled, just silently take no effect". The reverse direction (core depending on plugin types) is a dependency
cycle: nx's graph plugin maps static imports directly onto dependency edges.

Written as a type alias rather than an `interface`: the capability-plugin side needs to re-export it as its own domain
type (`WorkingTreeSwitchBranchOptions`), and that name carries a type-level assertion of "exactly these two fields and
no others" — the alias gives both sides **a single declaration**, so that assertion also guards this place.

## Properties

| Property                                                                       | Modifier   | Type      | Description                                                                                    | Defined in                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------- | --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-expectedactivationrevision"></a> `expectedActivationRevision?` | `readonly` | `number`  | When provided, the switch is rejected if the activation generation does not match it           | [packages/rxdb/src/rxdb-plugin-system.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L125) |
| <a id="property-requireclean"></a> `requireClean?`                             | `readonly` | `boolean` | Default matches the current behavior: switch unconditionally, byte-for-byte identical to today | [packages/rxdb/src/rxdb-plugin-system.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L122) |

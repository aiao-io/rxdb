# DevToolsVersionManager

Defined in: [connector-types.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L53)

The subset of branch write operations that DevTools actually calls.

## Remarks

This must be **hand-written** rather than `Pick`ed from upstream like
[DevToolsRxDB](../type-aliases/DevToolsRxDB.md): `VersionManager` lives in
`@aiao/rxdb-plugin-history`, and this package must not even have a peerDependency on it —
whether to install the history plugin is the host's choice, and devtools cannot decide the
installation topology on the host's behalf.

The drift risk of hand-writing is guarded by the compile-time assertions in
`__tests__/rxdb-contract.spec.ts`: the real `VersionManager` is assigned to this type there,
so a signature change upstream fails to compile.

All return values are collected as `Promise<unknown>`: the three methods' real return types
differ (`createBranch` returns `Promise<RxDBBranch>`, the other two return `Promise<void>`),
and the connector only `await`s them without reading the result.

## Methods

### createBranch() \{#createbranch\}

```ts
createBranch(name): Promise<unknown>;
```

Defined in: [connector-types.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L57)

Creates a branch by name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`Promise`&lt;`unknown`&gt;

***

### removeBranch() \{#removebranch\}

```ts
removeBranch(branchId): Promise<unknown>;
```

Defined in: [connector-types.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L59)

Removes the specified branch.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branchId` | `string` |

#### Returns

`Promise`&lt;`unknown`&gt;

***

### switchBranch() \{#switchbranch\}

```ts
switchBranch(branchId): Promise<unknown>;
```

Defined in: [connector-types.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L55)

Switches to the specified branch.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branchId` | `string` |

#### Returns

`Promise`&lt;`unknown`&gt;

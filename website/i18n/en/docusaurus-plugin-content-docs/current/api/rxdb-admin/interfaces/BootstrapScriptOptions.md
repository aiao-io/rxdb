# BootstrapScriptOptions

Defined in: [bootstrap.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/bootstrap.ts#L2)

The options of [createBootstrapScript](../functions/createBootstrapScript.md).

## Properties

### darkTheme? \{#darktheme\}

```ts
readonly darkTheme?: string;
```

Defined in: [bootstrap.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/bootstrap.ts#L8)

The theme name `system` maps to under a dark system, `dark` by default.

***

### lightTheme? \{#lighttheme\}

```ts
readonly lightTheme?: string;
```

Defined in: [bootstrap.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/bootstrap.ts#L6)

The theme name `system` maps to under a light system, `light` by default.

***

### storageKey \{#storagekey\}

```ts
readonly storageKey: string;
```

Defined in: [bootstrap.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/bootstrap.ts#L4)

The preferences storage key; must correspond to the shell's `storagePrefix` (`<prefix>.preferences`).

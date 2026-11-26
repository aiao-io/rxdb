# DesktopHostExecuteRequest

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:116

Executes SQL on an open session.

## Properties

### bindings \{#bindings\}

```ts
readonly bindings: readonly SQLiteCompatibleType[];
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:120

***

### kind \{#kind\}

```ts
readonly kind: "execute";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:117

***

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:118

***

### sql \{#sql\}

```ts
readonly sql: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:119

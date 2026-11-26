# DesktopHostOpenResult

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:165

Response to the `open` request.

## Properties

### beginSystemMigrationTransactionSql \{#beginsystemmigrationtransactionsql\}

```ts
readonly beginSystemMigrationTransactionSql: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:187

Strongest-lock SQL the host backend uses for system schema migrations.

***

### beginTransactionSql \{#begintransactionsql\}

```ts
readonly beginTransactionSql: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:185

SQL the host backend uses to begin an ordinary transaction.

***

### protocolVersion \{#protocolversion\}

```ts
readonly protocolVersion: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:183

Wire protocol version spoken by the host; same source as [DesktopHostHandshakeResult.protocolVersion](DesktopHostHandshakeResult.md#protocolversion).

#### Remarks

Version negotiation really happens at the [DesktopHostHandshakeRequest](DesktopHostHandshakeRequest.md) step; keeping a copy here
is the **second** check: when a proxy sits in between, or the host is swapped between two requests,
this copy still catches the mismatch. It is also the only check an old renderer has — remove it and
a 0.0.x renderer connecting to a new host could never verify the version again.

***

### resolvedLocation \{#resolvedlocation\}

```ts
readonly resolvedLocation: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:174

The resolved **logical** location, for diagnostics and logs only (AC#3).

#### Remarks

Deliberately not a physical absolute path: a renderer holding the physical root directory would be
holding extra filesystem intelligence, and it does not need that intelligence to do its job.

***

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:166

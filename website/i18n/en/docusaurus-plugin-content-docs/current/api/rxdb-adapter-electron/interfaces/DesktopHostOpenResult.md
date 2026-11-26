# DesktopHostOpenResult

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:165

Response to an `open` request.

## Properties

### beginSystemMigrationTransactionSql \{#beginsystemmigrationtransactionsql\}

```ts
readonly beginSystemMigrationTransactionSql: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:187

The strongest-lock SQL the host backend uses for system schema migrations.

---

### beginTransactionSql \{#begintransactionsql\}

```ts
readonly beginTransactionSql: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:185

The SQL the host backend uses to open ordinary transactions.

---

### protocolVersion \{#protocolversion\}

```ts
readonly protocolVersion: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:183

The wire protocol version the host speaks; same source as [DesktopHostHandshakeResult.protocolVersion](DesktopHostHandshakeResult.md#protocolversion).

#### Remarks

Version negotiation really happens at the [DesktopHostHandshakeRequest](DesktopHostHandshakeRequest.md) step; keeping a copy here is the **second**
line of defense: with a proxy in between, or the host swapped between two requests, this copy still catches the mismatch.
It is also the only check point for old renderers — remove it, and a 0.0.x renderer connecting to a new host can no longer verify the version.

---

### resolvedLocation \{#resolvedlocation\}

```ts
readonly resolvedLocation: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:174

The resolved **logical** location, for diagnostics and logs only (AC#3).

#### Remarks

Deliberately not a physical absolute path: handing the renderer the physical root directory would mean handing it
extra filesystem intelligence, and it does not need that intelligence to do its job.

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:166

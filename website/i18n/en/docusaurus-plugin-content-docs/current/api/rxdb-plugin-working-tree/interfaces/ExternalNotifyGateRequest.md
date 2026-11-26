# ExternalNotifyGateRequest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L29)

The judgment input of one external update notification.

## Remarks

**No column set**: the notification says "this table was changed externally", and which columns changed is inherently unknowable. The matrix
does not look at columns for `notify_external_update` either — row 11 rejects versioned targets unconditionally,
so [gateExternalNotify](../functions/gateExternalNotify.md) only needs to feed in some legal value.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L37)

Whether this database has the commit capability enabled

***

### entityName \{#entityname\}

```ts
readonly entityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L31)

The name of the notified entity; appears in the rejection message

***

### targetClass \{#targetclass\}

```ts
readonly targetClass: "system" | "versioned" | "untracked";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L34)

The table class this entity belongs to

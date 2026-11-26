# ExternalNotifyGateRequest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L29)

The judgment input for one external update notification

## Remarks

**There is no column set**: the notification says "this table was changed externally", and which columns were changed is inherently unknowable. The matrix doesn't look at columns for `notify_external_update` either — row 11 is unconditional rejection on versioned targets, so
[gateExternalNotify](../functions/gateExternalNotify.md) only needs to assemble one legal value to feed in.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L37)

Does this database have the commit capability enabled

---

### entityName \{#entityname\}

```ts
readonly entityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L31)

The name of the entity being notified; appears in the rejection message

---

### targetClass \{#targetclass\}

```ts
readonly targetClass: "system" | "versioned" | "untracked";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L34)

The table class this entity belongs to

# CapabilityEnabledEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:656](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L656)

Capability enabled event (FR-037).

## Remarks

Broadcast through the gateway by the connection of the enabler; other same-origin connections wire up the capability themselves after receiving it.
The sender does **not** receive this event of its own: it already wired itself synchronously inside `enable()`.

## Constructors

### Constructor

```ts
new CapabilityEnabledEvent(capability): CapabilityEnabledEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:659](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L659)

#### Parameters

| Parameter    | Type     | Description                                                                |
| ------------ | -------- | -------------------------------------------------------------------------- |
| `capability` | `string` | The capability name, the same value as `RxDBSystemContribution.capability` |

#### Returns

`CapabilityEnabledEvent`

## Properties

### capability \{#capability\}

```ts
readonly capability: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:661](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L661)

The capability name, the same value as `RxDBSystemContribution.capability`

---

### type \{#type\}

```ts
readonly type: "CAPABILITY_ENABLED" = CAPABILITY_ENABLED_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:657](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L657)

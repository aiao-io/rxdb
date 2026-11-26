# RawWriteContext

```ts
type RawWriteContext =
  | {
      capabilityEnabled: false;
    }
  | {
      capabilityEnabled: true;
      gate: RawWriteGate;
    };
```

Defined in: [packages/rxdb/src/capture/raw-write-gate.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/raw-write-gate.ts#L45)

The current raw-write judgment context of an adapter instance (adapter-contract.md §2)

## Union Members

### Type Literal

```ts
{
  capabilityEnabled: false;
}
```

#### capabilityEnabled

```ts
readonly capabilityEnabled: false;
```

This database does not have the commit capability enabled; raw writes are allowed unconditionally

---

### Type Literal

```ts
{
  capabilityEnabled: true;
  gate: RawWriteGate;
}
```

#### capabilityEnabled

```ts
readonly capabilityEnabled: true;
```

This database has the commit capability enabled

#### gate

```ts
readonly gate: RawWriteGate;
```

The judgment entry point; comes from the capture runtime installed on this adapter

## Remarks

Handed out by `RxDBAdapterLocalBase.workingTreeRawWriteContext`, and the adapter passes it to
[gateRawWrite](../functions/gateRawWrite.md) as-is — never unwrapped, never augmented on the way. So the only thing the six
adapters need to get right is "pass it to the gate"; the two genuinely error-prone questions — "how is the capability
bit computed" and "where does the judgment come from" — never land on them.

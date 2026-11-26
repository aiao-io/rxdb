# WorkingTreeEnableIfEmptyResult

```ts
type WorkingTreeEnableIfEmptyResult = 
  | {
  capability: CommitCapabilityInfo;
  kind: "enabled";
}
  | {
  capability: CommitCapabilityInfo;
  kind: "already_enabled";
}
  | {
  kind: "not_empty";
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L106)

The three outcomes of [WorkingTreeManager.enableIfEmpty](../classes/WorkingTreeManager.md#enableifempty).

## Union Members

### Type Literal

```ts
{
  capability: CommitCapabilityInfo;
  kind: "enabled";
}
```

#### capability

```ts
readonly capability: CommitCapabilityInfo;
```

The capability info after enabling

#### kind

```ts
readonly kind: "enabled";
```

The discriminator: this call performed the enable

***

### Type Literal

```ts
{
  capability: CommitCapabilityInfo;
  kind: "already_enabled";
}
```

#### capability

```ts
readonly capability: CommitCapabilityInfo;
```

The capability info as it stands

#### kind

```ts
readonly kind: "already_enabled";
```

The discriminator: the database was already enabled, and this call changed nothing

***

### Type Literal

```ts
{
  kind: "not_empty";
}
```

#### kind

```ts
readonly kind: "not_empty";
```

The discriminator: the database already has content, so per the rule it is not auto-enabled; a manual
`enable()` still works

## Remarks

A discriminated union rather than `{ enabled: boolean; … }`: the three outcomes each carry their own
payload — `enabled` and `already_enabled` carry capability info, `not_empty` carries nothing. Flattened into
one object, a capability info (or a nullable field) would have to be fabricated for "the enable that did not
happen", and callers would be forced to handle four combinations, two of which are fake.

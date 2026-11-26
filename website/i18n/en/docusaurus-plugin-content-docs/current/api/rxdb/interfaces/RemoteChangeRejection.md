# RemoteChangeRejection

Defined in: [packages/rxdb/src/rxdb-adapter.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L72)

The reason the remote rejected a local change

## Properties

### code \{#code\}

```ts
code: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L74)

The database SQLSTATE, e.g. `42501`

***

### dependsOn? \{#dependson\}

```ts
dependsOn?: 
  | RemoteEntityRef
  | {
  constraint: string;
};
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L82)

Points to the parent entity when `reason = 'dependency'`; gives the constraint name when it cannot be located

***

### entity \{#entity\}

```ts
entity: RemoteEntityRef;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L80)

The rejected entity

***

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L78)

The remote's raw message

***

### reason \{#reason\}

```ts
reason: "denied" | "gone" | "dependency";
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L76)

Classification: permission denied / the target row no longer exists / the depended-on entity is unavailable

# RestoreInput

```ts
type RestoreInput = 
  | {
  kind: "choose_restore";
}
  | {
  kind: "archive_selected";
  targetDbName: string;
}
  | {
  kind: "cancel";
}
  | {
  kind: "restore_succeeded";
}
  | {
  kind: "readback_succeeded";
}
  | {
  kind: "archive_invalid";
  reason: string;
}
  | {
  kind: "restore_failed";
  reason: string;
}
  | {
  kind: "readback_failed";
  reason: string;
};
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L14)

State machine input (the host translates user actions and execution results into inputs).

## Union Members

### Type Literal

```ts
{
  kind: "choose_restore";
}
```

***

### Type Literal

```ts
{
  kind: "archive_selected";
  targetDbName: string;
}
```

An archive has been selected and the target database name for this restore generated (the host writes the restoring marker and the target record based on this).

***

### Type Literal

```ts
{
  kind: "cancel";
}
```

***

### Type Literal

```ts
{
  kind: "restore_succeeded";
}
```

***

### Type Literal

```ts
{
  kind: "readback_succeeded";
}
```

***

### Type Literal

```ts
{
  kind: "archive_invalid";
  reason: string;
}
```

***

### Type Literal

```ts
{
  kind: "restore_failed";
  reason: string;
}
```

***

### Type Literal

```ts
{
  kind: "readback_failed";
  reason: string;
}
```

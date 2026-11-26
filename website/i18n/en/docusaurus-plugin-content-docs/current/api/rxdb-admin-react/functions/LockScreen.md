# LockScreen()

```ts
function LockScreen(): ReactElement;
```

Defined in: [lock/lock-screen.tsx:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/lock/lock-screen.tsx#L91)

Lock screen: a modal `<dialog>` covering the UI that Esc cannot close; asks to set a password first when none is set; a forgotten password can be reset (data is unaffected).

## Returns

`ReactElement`

The lock screen element; the `<dialog>` stays closed when not locked.

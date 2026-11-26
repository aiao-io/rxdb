# injectAdminShell()

```ts
function injectAdminShell(): AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/context.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/context.ts#L49)

Reads the nearest shell; must be called in an injection context.

## Returns

[`AdminShell`](../../rxdb-admin/interfaces/AdminShell.md)&lt;`LucideIconInput`&gt;

The shell.

## Throws

Throws when [provideAdminShell](provideAdminShell.md) is missing.

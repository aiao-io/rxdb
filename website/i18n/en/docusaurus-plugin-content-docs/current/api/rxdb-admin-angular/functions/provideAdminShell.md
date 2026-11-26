# provideAdminShell()

```ts
function provideAdminShell(shell): EnvironmentProviders;
```

Defined in: [rxdb-admin-angular/src/context.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/context.ts#L34)

Provides the shell and binds it to the browser during environment initialization (shortcuts, theme, layout variables, title), unbinding when the injector is destroyed.
Environment initialization happens before any component's first render, so no theme flash occurs; `attach` is idempotent.

## Parameters

| Parameter | Type                                                                               | Description                              |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `shell`   | [`AdminShell`](../../rxdb-admin/interfaces/AdminShell.md)&lt;`LucideIconInput`&gt; | The shell created by `createAdminShell`. |

## Returns

`EnvironmentProviders`

Environment providers, to put into the `providers` of `bootstrapApplication` / routes / `TestBed`.

## Example

```ts
const shell = createAdminShell<AdminIcon>({
  navigate: url => void router.navigateByUrl(url),
  brand: { title: 'Workspace' }
});
bootstrapApplication(App, { providers: [provideAdminShell(shell)] });
```

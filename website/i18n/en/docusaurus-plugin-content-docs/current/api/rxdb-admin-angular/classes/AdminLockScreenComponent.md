# AdminLockScreenComponent

Defined in: [rxdb-admin-angular/src/lock/lock-screen.component.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/lock/lock-screen.component.ts#L121)

Lock screen: a modal `<dialog>` covers the UI, Esc cannot close it; requires setting a password first when none is set, and a forgotten password can be reset (data is unaffected).
The `<dialog>` stays closed when not locked.

## Constructors

### Constructor

```ts
new AdminLockScreenComponent(): AdminLockScreenComponent;
```

#### Returns

`AdminLockScreenComponent`

## Properties

### locked \{#locked\}

```ts
protected readonly locked: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/lock/lock-screen.component.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/lock/lock-screen.component.ts#L123)

***

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/lock/lock-screen.component.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/lock/lock-screen.component.ts#L122)

Translates shell text.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | Text key. |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

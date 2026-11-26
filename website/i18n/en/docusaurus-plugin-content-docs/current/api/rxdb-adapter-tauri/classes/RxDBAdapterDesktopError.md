# RxDBAdapterDesktopError

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:58

Desktop adapter error.

## Remarks

Error messages start with a `[code]` prefix for easy log searching; program logic should read
[RxDBAdapterDesktopError.code](#code) instead of matching text. The original cause is passed through
via `cause` as-is, without wrapping or swallowing (AC#4).

## Extends

- `Error`

## Constructors

### Constructor

```ts
new RxDBAdapterDesktopError(
   code, 
   detail, 
   options?
): RxDBAdapterDesktopError;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:74

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `code` | [`RxDBAdapterDesktopErrorCode`](../type-aliases/RxDBAdapterDesktopErrorCode.md) | Stable error code |
| `detail` | `string` | Developer-facing description, without the error-code prefix |
| `options?` | `ErrorOptions` | Standard `ErrorOptions`; use `cause` to carry the original error |

#### Returns

`RxDBAdapterDesktopError`

#### Overrides

`Error.constructor`

## Properties

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

`Error.cause`

***

### code \{#code\}

```ts
readonly code: RxDBAdapterDesktopErrorCode;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:59

***

### detail \{#detail\}

```ts
readonly detail: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:68

Original description without the `[code]` prefix.

#### Remarks

When rebuilding an error across IPC, this is what gets passed, not `message`: passing `message`
would add the prefix a second time, and the renderer would read `[open_failed] [open_failed] ...`.

***

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

`Error.message`

***

### name \{#name\}

```ts
readonly name: "RxDBAdapterDesktopError" = "RxDBAdapterDesktopError";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:60

#### Overrides

`Error.name`

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

`Error.stack`

# BoardDomainError

Defined in: packages/rxdb-plugin-board/dist/errors.d.ts:10

Board domain error: stable error code + readable message.

## Extends

- `Error`

## Constructors

### Constructor

```ts
new BoardDomainError(code, message): BoardDomainError;
```

Defined in: packages/rxdb-plugin-board/dist/errors.d.ts:12

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | [`BoardErrorCode`](../../rxdb-plugin-board/type-aliases/BoardErrorCode.md) |
| `message` | `string` |

#### Returns

`BoardDomainError`

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
readonly code: BoardErrorCode;
```

Defined in: packages/rxdb-plugin-board/dist/errors.d.ts:11

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
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

`Error.name`

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

`Error.stack`

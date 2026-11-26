# RxDBReplayOptions

Defined in: [packages/rxdb-plugin-replay/src/options.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L32)

Options of `rxdb.use(rxDBPluginReplay, options)`.

## Properties

### createRecordingDb \{#createrecordingdb\}

```ts
readonly createRecordingDb: ReplayRecordingDbFactory;
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L34)

Recording database factory, required. See [ReplayRecordingDbFactory](../type-aliases/ReplayRecordingDbFactory.md).

***

### flush? \{#flush\}

```ts
readonly flush?: object;
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L43)

Event storage cadence: a flush happens whenever the first condition is met.

#### intervalMs?

```ts
readonly intervalMs?: number;
```

Maximum buffering time. @defaultValue 1000

#### maxEvents?

```ts
readonly maxEvents?: number;
```

Maximum buffered event count. @defaultValue 200

***

### limits? \{#limits\}

```ts
readonly limits?: object;
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L36)

Size limits, measured in UTF-8 bytes after `JSON.stringify`. Old data is never deleted automatically when a limit is exceeded.

#### sessionBytes?

```ts
readonly sessionBytes?: number;
```

Per-session limit; when exceeded the session stops recording and is marked `truncated`. @defaultValue 16 MiB

#### storeBytes?

```ts
readonly storeBytes?: number;
```

Total recording database limit; starting a new session is refused once reached. Must be ≥ `sessionBytes`. @defaultValue 128 MiB

***

### record? \{#record\}

```ts
readonly record?: RxDBReplayRecordOptions;
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L50)

Masking / blocking options; `maskAllInputs` defaults to `true`.

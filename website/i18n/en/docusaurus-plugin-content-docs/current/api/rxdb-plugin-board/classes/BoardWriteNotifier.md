# BoardWriteNotifier

Defined in: [packages/rxdb-plugin-board/src/write-notifier.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/write-notifier.ts#L20)

Write event notifier: the three framework bindings and tests subscribe to the same event stream.

## Constructors

### Constructor

```ts
new BoardWriteNotifier(): BoardWriteNotifier;
```

#### Returns

`BoardWriteNotifier`

## Properties

### events$ \{#events\}

```ts
readonly events$: Observable<BoardWriteEvent>;
```

Defined in: [packages/rxdb-plugin-board/src/write-notifier.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/write-notifier.ts#L23)

## Methods

### complete() \{#complete\}

```ts
complete(): void;
```

Defined in: [packages/rxdb-plugin-board/src/write-notifier.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/write-notifier.ts#L29)

#### Returns

`void`

***

### next() \{#next\}

```ts
next(event): void;
```

Defined in: [packages/rxdb-plugin-board/src/write-notifier.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/write-notifier.ts#L25)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`BoardWriteEvent`](../type-aliases/BoardWriteEvent.md) |

#### Returns

`void`

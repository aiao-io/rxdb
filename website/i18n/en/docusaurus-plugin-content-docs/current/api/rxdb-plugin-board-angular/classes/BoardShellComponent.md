# BoardShellComponent

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L39)

Board shell component (`<board-shell>`, US-537 / US-539 AC#4 / #5): startup selection (new empty board / load demo data / restore from backup),
preparing and restoring, toolbar (reset to demo data / restore from backup) and in-app confirmation, embedding [BoardViewComponent](BoardViewComponent.md) in the board phase.

## Remarks

All orchestration lives in the core package's `BoardShellController` (active position, full page reload and read-back after restoring to a new database name, cross-page restoring and database-switch reload);
the component only renders its state and forwards user actions. Same functionality and same DOM contract as the React / Vue `BoardShell` (class names + data-testid).
`options` is read only once at initialization; styles ship via the `./board-view.css` subpath.

## Implements

- `OnInit`
- `OnDestroy`

## Constructors

### Constructor

```ts
new BoardShellComponent(): BoardShellComponent;
```

#### Returns

`BoardShellComponent`

## Properties

### confirmTitleId \{#confirmtitleid\}

```ts
protected readonly confirmTitleId: string;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L51)

***

### options \{#options\}

```ts
readonly options: InputSignal<BoardShellOptions>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L54)

Host configuration: instance factory, local adapter name, optional demo data (read once at initialization).

***

### state \{#state\}

```ts
protected readonly state: WritableSignal<
  | BoardShellState
  | null>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L50)

## Methods

### downloadBackup() \{#downloadbackup\}

```ts
protected readonly downloadBackup(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L78)

Export callback of the board view: the archive is handed to the browser download only after it has been fully generated.

#### Returns

`Promise`&lt;`void`&gt;

***

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L72)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

***

### ngOnInit() \{#ngoninit\}

```ts
ngOnInit(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L56)

A callback method that is invoked immediately after the
default change detector has checked the directive's
data-bound properties for the first time,
and before any of the view or content children have been checked.
It is invoked only once when the directive is instantiated.

#### Returns

`void`

#### Implementation of

`OnInit.ngOnInit`

***

### onConfirmKeydown() \{#onconfirmkeydown\}

```ts
protected onConfirmKeydown(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L105)

Keyboard of the confirm dialog: Esc cancels; Tab does not leave the dialog (WAI-ARIA modal dialog).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `KeyboardEvent` |

#### Returns

`void`

***

### onRestoreFile() \{#onrestorefile\}

```ts
protected onRestoreFile(event): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L92)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `Event` |

#### Returns

`void`

***

### resetDemo() \{#resetdemo\}

```ts
protected resetDemo(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L88)

#### Returns

`void`

***

### settleConfirm() \{#settleconfirm\}

```ts
protected settleConfirm(confirmed): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L100)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `confirmed` | `boolean` |

#### Returns

`void`

***

### startEmpty() \{#startempty\}

```ts
protected startEmpty(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L80)

#### Returns

`void`

***

### startSeed() \{#startseed\}

```ts
protected startSeed(): void;
```

Defined in: [packages/rxdb-plugin-board-angular/src/board-shell.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/board-shell.ts#L84)

#### Returns

`void`

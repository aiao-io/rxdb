# ReplayerComponent

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L50)

The session replay component: mounts core's `mountReplayer` on a `div` inside the component, routes input changes through `update()`, and calls `destroy()` on destruction.

## Remarks

Same set of inputs / outputs / commands as the React / Vue `Replayer` (contracts/replayer-component.md §3), guaranteed by the parity cases.
Mounts only after the browser renders (`afterNextRender`) and does not touch the DOM under SSR; `rrweb` is lazily `import()`ed inside the core view and does not enter the bundle before mounting.

## Example

```html
<ao-replayer #replayer [replay]="rxdb.replay" [sessionId]="sessionId" (aoCommitRestore)="onRestore($event)" />
<button (click)="replayer.play()">Play</button>
```

## Constructors

### Constructor

```ts
new ReplayerComponent(): ReplayerComponent;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L75)

#### Returns

`ReplayerComponent`

## Properties

### aoCommitRestore \{#aocommitrestore\}

```ts
readonly aoCommitRestore: OutputEmitterRef<ReplayerCommitRestoreEvent>;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L73)

The restore result after clicking a commit marker (success, one of the four rejections, or a thrown error).

***

### aoTimeChange \{#aotimechange\}

```ts
readonly aoTimeChange: OutputEmitterRef<number>;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L71)

Fired when playback / seeking changes the replay time (ms).

***

### initialTime \{#initialtime\}

```ts
readonly initialTime: InputSignal<number | undefined>;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L68)

The moment to land on after loading completes (ms relative to the session start, default 0); changing it afterwards is equivalent to `seek()`.

***

### replay \{#replay\}

```ts
readonly replay: InputSignal<ReplayManager>;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L64)

The recording facade (`rxdb.replay`). Switching instances reloads.

***

### sessionId \{#sessionid\}

```ts
readonly sessionId: InputSignal<string>;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L66)

The session to replay. Switching sessions reloads without rebuilding the component.

## Methods

### pause() \{#pause\}

```ts
pause(): void;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L112)

Pauses; calls before loading completes are no-ops.

#### Returns

`void`

***

### play() \{#play\}

```ts
play(): void;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L107)

Plays; calls before loading completes are no-ops.

#### Returns

`void`

***

### seek() \{#seek\}

```ts
seek(timeMs): void;
```

Defined in: [rxdb-plugin-replay-angular/src/replayer.component.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-angular/src/replayer.component.ts#L117)

Jumps to `timeMs` relative to the session start; calls before loading completes record the target time.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `timeMs` | `number` |

#### Returns

`void`

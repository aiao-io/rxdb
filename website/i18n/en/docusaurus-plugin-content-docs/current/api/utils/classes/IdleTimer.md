# IdleTimer

Defined in: [packages/utils/src/@browser/IdleTimer.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L51)

Browser idle detection.

Listens to mouse / keyboard / touch / wheel / visibility-change events on `document` (capture + passive). Each event pushes the state back to "not idle" and resets the timer; after `timeout` milliseconds of silence it pushes "idle".

Requires the global `document` — browser only. Always call [IdleTimer.destroy](#destroy) when done, otherwise the event listeners stay attached to `document`.

## Example

```ts
const timer = new IdleTimer({ timeout: 5000 });
timer.idle$.subscribe(idle => console.log(idle));
timer.start();
// ...
timer.destroy();
```

## Constructors

### Constructor

```ts
new IdleTimer(options?): IdleTimer;
```

Defined in: [packages/utils/src/@browser/IdleTimer.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L71)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`IdleTimerOptions`](../interfaces/IdleTimerOptions.md) | See [IdleTimerOptions](../interfaces/IdleTimerOptions.md); when omitted, `timeout` is 2000 |

#### Returns

`IdleTimer`

#### Throws

`TypeError` when `options.timeout` is not a non-negative safe integer (no silent fallback to the default)

## Properties

### idle$ \{#idle\}

```ts
idle$: Observable<boolean>;
```

Defined in: [packages/utils/src/@browser/IdleTimer.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L65)

Idle state stream.

Behavior-like (subscribers immediately receive the current value, initially `false`) and `distinctUntilChanged`-filtered, so it emits only on real flips. After [IdleTimer.destroy](#destroy) the stream completes and emits no more.

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/utils/src/@browser/IdleTimer.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L118)

Releases all resources: detaches listeners, clears the timer, completes [IdleTimer.idle$](#idle).

Idempotent; repeated calls are safe no-ops. **Irreversible** — afterwards [IdleTimer.start](#start) / [IdleTimer.stop](#stop) throw; create a new instance if detection is still needed.

#### Returns

`void`

***

### start() \{#start\}

```ts
start(): void;
```

Defined in: [packages/utils/src/@browser/IdleTimer.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L89)

Starts detection: binds the event listeners, immediately sets the state to "not idle", and restarts the `timeout` countdown.

Idempotent — repeated calls do not bind listeners twice; they only reset the timer.

#### Returns

`void`

#### Throws

`Error` when the instance has been [IdleTimer.destroy](#destroy)-ed; a destroyed instance cannot be revived, create a new one

***

### stop() \{#stop\}

```ts
stop(): void;
```

Defined in: [packages/utils/src/@browser/IdleTimer.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L106)

Pauses detection: detaches the event listeners and clears the timer.

Does **not** change the current value of [IdleTimer.idle$](#idle) and does not complete it; [IdleTimer.start](#start) can resume later. Idempotent.

#### Returns

`void`

#### Throws

`Error` when the instance has been [IdleTimer.destroy](#destroy)-ed

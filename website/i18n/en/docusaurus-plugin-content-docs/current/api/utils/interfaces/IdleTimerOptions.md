# IdleTimerOptions

Defined in: [packages/utils/src/@browser/IdleTimer.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L24)

Constructor parameters of [IdleTimer](../classes/IdleTimer.md).

## Properties

### timeout? \{#timeout\}

```ts
timeout?: number;
```

Defined in: [packages/utils/src/@browser/IdleTimer.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/IdleTimer.ts#L32)

The number of milliseconds without user interaction after which the timer is considered idle.

Must be a **non-negative safe integer**; `0` is valid and means idle is determined at the next macro task.

#### Default

```ts
2000;
```

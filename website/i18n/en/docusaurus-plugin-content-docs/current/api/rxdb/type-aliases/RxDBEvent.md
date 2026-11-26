# RxDBEvent

```ts
type RxDBEvent = RxDBEventMap[keyof RxDBEventMap];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:713](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L713)

Union type of RxDB events.

## Remarks

**Discrimination contract: only `event.type` may be used, never `instanceof`.**
After a cross-tab event passes through the BroadcastChannel structured clone, its `constructor` is `Object`; the
gateway rebuilds the object by expanding the `type` field (see `RxDBTabsGateway.#markEventAsCrossTab`) and does not
call the constructor of the original event class. Therefore the same logical event has different prototypes in-tab and
cross-tab, and `instanceof EntityLocalCreatedEvent` returns `false` on the cross-tab path. `type` is the only
discriminator that is stable on both paths.

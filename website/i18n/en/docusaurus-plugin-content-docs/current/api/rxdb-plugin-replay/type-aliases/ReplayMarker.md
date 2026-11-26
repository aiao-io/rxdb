# ReplayMarker

```ts
type ReplayMarker = { [Tag in ReplayMarkerTag]: { payload: ReplayMarkerPayloads[Tag]; tag: Tag } }[ReplayMarkerTag];
```

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L37)

Result of [parseReplayMarker](../functions/parseReplayMarker.md).

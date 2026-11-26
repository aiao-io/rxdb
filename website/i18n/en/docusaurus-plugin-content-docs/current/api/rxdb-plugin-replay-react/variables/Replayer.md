# Replayer

```ts
const Replayer: ForwardRefExoticComponent<ReplayerProps & RefAttributes<ReplayerRef>>;
```

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L50)

The session replay component: mounts core's `mountReplayer` in a `div`, routes input changes through `update()`, and calls `destroy()` on unmount.

## Remarks

Same set of inputs / outputs / commands as Angular `ao-replayer` and Vue `Replayer` (contracts/replayer-component.md §3), guaranteed by the parity cases.
`rrweb` is lazily `import()`ed inside the core view and does not enter the bundle before this component is mounted.

## Example

```tsx
const replayer = useRef<ReplayerRef>(null);
<Replayer ref={replayer} replay={rxdb.replay} sessionId={sessionId} onCommitRestore={event => console.log(event.result)} />;
```

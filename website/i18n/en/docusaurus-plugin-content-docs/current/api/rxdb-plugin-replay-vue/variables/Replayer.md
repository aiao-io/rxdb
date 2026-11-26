# Replayer

```ts
const Replayer: DefineComponent<
  ExtractPropTypes<{
    initialTime: {
      default: undefined;
      type: NumberConstructor;
    };
    replay: {
      required: true;
      type: PropType<ReplayManager>;
    };
    sessionId: {
      required: true;
      type: StringConstructor;
    };
  }>,
  () => VNode<
    RendererNode,
    RendererElement,
    {
      [key: string]: any;
    }
  >,
  {},
  {},
  {},
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  {
    'commit-restore': (event) => boolean;
    'time-change': (timeMs) => boolean;
  },
  string,
  PublicProps,
  ToResolvedProps<
    ExtractPropTypes<{
      initialTime: {
        default: undefined;
        type: NumberConstructor;
      };
      replay: {
        required: true;
        type: PropType<ReplayManager>;
      };
      sessionId: {
        required: true;
        type: StringConstructor;
      };
    }>,
    {
      'commit-restore': (event) => boolean;
      'time-change': (timeMs) => boolean;
    }
  >,
  {
    initialTime: number;
  },
  {},
  {},
  {},
  string,
  ComponentProvideOptions,
  true,
  {},
  any
>;
```

Defined in: [rxdb-plugin-replay-vue/src/replayer.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-vue/src/replayer.ts#L36)

The session replay component: mounts core's `mountReplayer` on the root `div`, routes prop changes through `update()`, and calls `destroy()` before unmounting.

## Remarks

Same set of inputs / outputs / commands as Angular `ao-replayer` and React `Replayer` (contracts/replayer-component.md §3), guaranteed by the parity cases.
Events: `time-change` (replay time, ms), `commit-restore` ([ReplayerCommitRestoreEvent](../interfaces/ReplayerCommitRestoreEvent.md)).
`rrweb` is lazily `import()`ed inside the core view and does not enter the bundle before this component is mounted.

## Example

```vue
<Replayer :replay="rxdb.replay" :session-id="sessionId" @commit-restore="event => log(event.result)" ref="replayer" />
```

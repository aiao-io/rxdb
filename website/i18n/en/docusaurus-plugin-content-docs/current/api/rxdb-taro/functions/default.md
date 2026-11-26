# default()

```ts
function default(ctx): void;
```

Defined in: [index.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-taro/src/index.ts#L95)

**`Experimental`**

Taro plugin: appends the adapter's build prerequisites (glue without `import.meta.url`, wasm emitted into the code package, real global object bound for Douyin)
into `compiler.vitePlugins`, assembled the same way as `@aiao/rxdb-taro/vite`'s `miniProgramVitePlugins`.

Changes configuration only via `modifyRunnerOpts`: it is awaited before the runner starts; `modifyViteConfig` is not awaited, and ordering it after async plugins would
race with vite reading the configuration. Fails the build outright when the platform is not `weapp` / `tt` or the compiler is not vite. Only replaces Taro's hardcoded `es6` build target.

## Parameters

| Parameter | Type                                                      | Description                         |
| --------- | --------------------------------------------------------- | ----------------------------------- |
| `ctx`     | [`TaroPluginContext`](../interfaces/TaroPluginContext.md) | The plugin context injected by Taro |

## Returns

`void`

## Example

```ts
// config/index.ts
export default defineConfig<'vite'>({
  compiler: 'vite',
  plugins: ['@aiao/rxdb-taro']
});
```

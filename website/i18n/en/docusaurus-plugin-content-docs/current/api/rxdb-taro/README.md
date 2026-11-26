# rxdb-taro

**Experimental.** One-line integration of the build prerequisites of [`@aiao/rxdb-adapter-miniprogram`](../rxdb-adapter-miniprogram/README.md) for Taro 4.3 (vite compiler) projects; currently supports WeChat (`weapp`) and Douyin (`tt`).

Platform coverage follows the adapter: Douyin is experimental, Android unverified; single connection, no crash recovery guarantee. This package does not widen the support surface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-miniprogram
pnpm add -D @aiao/rxdb-taro
```

- `@tarojs/cli` `~4.3.0`; the compiler must be vite
- Node.js `>=20.19`: this package ships ESM only, and Taro loads plugins with `require()`, relying on Node's `require(esm)`

## Usage

```ts
// config/index.ts
import { defineConfig } from '@tarojs/cli';

export default defineConfig<'vite'>({
  compiler: 'vite',
  plugins: ['@aiao/rxdb-taro']
});
```

The plugin does four things; missing the first three only errors in the devtools or on a real device, missing the last one fails the build outright:

| What it does                                                                                                                          | Consequence when missing                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Emits the wasm the adapter depends on to `wa-sqlite/wa-sqlite.wasm` at the output root                                                | the wasm cannot be found when creating the database                                                                     |
| Blanks out `import.meta.url` in the `@subframe7536/sqlite-wasm` glue                                                                  | mini programs have no `import.meta`; vite would also inline the ~0.7 MB wasm into the code package as base64            |
| Douyin: free `globalThis` references in the output are redirected to the real global object registered at the entry (`rxdb-realm.js`) | in Douyin modules `globalThis` is `undefined`, and the comlink module throws a TypeError as soon as its top level loads |
| Raises the build target to `es2020` when it is still Taro's hardcoded `es6`                                                           | the vite 4 shipped with the Taro 4.3 template cannot transform RxDB's BigInt literals under es6 and the build errors    |

The wasm goes through vite's `emitFile`, landing relative to `outputRoot`; it does not depend on `copy.patterns`. The Douyin entry `app.js` must be non-strict mode; the build fails when it carries `use strict`.

### Build-time failures

- `TARO_ENV` is not `weapp` / `tt`: errors outright, listing the supported platforms (see the next section for Alipay).
- The compiler is not vite (including the default webpack5): errors outright.
- `compiler.vitePlugins` is not an array: errors outright (Taro treats it as unconfigured, and the plugin would silently never attach).
- `@aiao/rxdb-adapter-miniprogram` cannot be resolved from the app root: errors at the very start of the build.

### What it doesn't do

- **Does not override your `build.target`.** It only raises the target when it is still Taro's hardcoded `es6` (`enforce: 'post'`, ordered after Taro); set any other value in `compiler.vitePlugins` and yours wins. The adapter requires native `BigInt` anyway, so raising to es2020 does not narrow the support surface.
- **Does not touch babel.** For projects using decorators, the babel configuration belongs to the project itself.
- Changes configuration only via Taro's `modifyRunnerOpts`: it is awaited before the runner starts; `modifyViteConfig` is not awaited, and ordering it after async plugins would race with vite reading the configuration.

### Known environment issues

- When installing Taro 4.3's React template with pnpm, the build errors that `@babel/plugin-proposal-decorators` cannot be found (unrelated to this package; a bare template reports the same). Fix with `pnpm add -D @babel/plugin-proposal-decorators@^7`; installing 8.x errors that the decorators plugin is missing the `version` option.

## Runtime entry

In the mini program logic layer, obtain the adapter host and the platform WASM runtime according to the build platform — no need to write `wx` / `tt` branches yourself:

```ts
import { prepareMiniProgramHostRuntime } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { taroMiniProgramRuntime } from '@aiao/rxdb-taro/runtime';

const { host, wasmRuntime } = taroMiniProgramRuntime();
await prepareMiniProgramHostRuntime(host);
// afterwards create the database per the adapter README: new RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime })
```

- The platform check compares `process.env.TARO_ENV` against literals; Taro replaces it with a constant at build time, and the other platform's branch is tree-shaken together with the globals it reads: the WeChat output has no `typeof tt` / `TTWebAssembly`, and the Douyin output has no `typeof wx` / `WXWebAssembly`.
- When the platform global is missing it errors outright and does not fall back to the other platform; when `WXWebAssembly` / `TTWebAssembly` are missing, `wasmRuntime` is `undefined`, and the adapter's runtime pre-check reports the missing items.
- On Douyin, don't pass `runtimeGlobal`: the Taro plugin has already redirected free `globalThis` references in the output to the real global object.
- Only `weapp` / `tt` are supported; Alipay needs a Worker randomness source and runtime patching — assemble it yourself per the adapter README's "Alipay" section.

## Alipay (experimental)

The Taro plugin does not open Alipay: Alipay also needs lazy-loaded subpackages, tag `var` hoisting, plus `workers` in `app.config.ts` and `compileOptions.transpile` in `project.alipay.json` that the plugin cannot touch — see the adapter README's "Alipay" section. The wasm, base64 copy, randomness Worker, real-global-object registration, and build target (Taro's `es6` raised to the tested `es2018`) are assembled by `@aiao/rxdb-taro/vite`:

```ts
// config/index.ts
import { miniProgramVitePlugins } from '@aiao/rxdb-taro/vite';

export default defineConfig<'vite'>({
  compiler: {
    type: 'vite',
    // Taro treats the launch directory as the app root
    vitePlugins: [...miniProgramVitePlugins('alipay', process.cwd()) /* lazy-loaded subpackages, etc. */]
  }
});
```

The Worker's path inside the code package is exported as `ALIPAY_WORKER_PATH` (`workers/index.js`).

`miniProgramVitePlugins(platform, appRoot)` also accepts `weapp` / `tt`, for projects that assemble their own vite configuration instead of going through the Taro plugin mechanism.

## Version

Only the tested Taro 4.3.x is promised: the `modifyRunnerOpts` configuration shape the plugin depends on is not a publicly documented Taro contract, and must be re-verified after upgrading Taro.

Taro plugin: one-line integration of `@aiao/rxdb-adapter-miniprogram`'s build prerequisites (experimental, WeChat and Douyin, vite compiler).

## Interfaces

| Interface                                                | Description                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [TaroCompilerOptions](interfaces/TaroCompilerOptions.md) | Taro's compiler configuration (object form).                                                                 |
| [TaroPluginContext](interfaces/TaroPluginContext.md)     | The Taro plugin context this plugin uses; structurally compatible with `@tarojs/service`'s `IPluginContext`. |
| [TaroRunnerOptions](interfaces/TaroRunnerOptions.md)     | The whole project configuration received by `modifyRunnerOpts`; this plugin only reads/writes `compiler`.    |

## Functions

| Function                        | Description                                                                                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [default](functions/default.md) | Taro plugin: appends the adapter's build prerequisites (glue without `import.meta.url`, wasm emitted into the code package, real global object bound for Douyin) into `compiler.vitePlugins`, assembled the same way as `@aiao/rxdb-taro/vite`'s `miniProgramVitePlugins`. |

# Taro (miniprograms)

`@aiao/rxdb-taro` (**experimental**) is a build configuration plugin that gives Taro 4.3 (vite compiler) projects a **one-line** hookup of the miniprogram adapter's build prerequisites. It is not an RxDB runtime plugin. WeChat (`weapp`) and Douyin (`tt`) are currently supported; Alipay goes through the `./vite` subpath (see below).

Platform guarantees follow the [miniprogram adapter](/adapters/miniprogram.md): Douyin is experimental, Android is unverified, single connection, no crash-recovery guarantee. This package does not widen that support.

## Install

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-miniprogram
npm install -D @aiao/rxdb-taro
```

- `@tarojs/cli` `~4.3.0`; the compiler must be vite
- Node.js `>=20.19`: this package ships ESM only, and Taro loads plugins with `require()`, which relies on Node's `require(esm)`

## One-line hookup

```ts
// config/index.ts
import { defineConfig } from '@tarojs/cli';

export default defineConfig<'vite'>({
  compiler: 'vite',
  plugins: ['@aiao/rxdb-taro']
});
```

The plugin does four things. Missing the first three only errors in the developer tools or on a real device; missing the last one fails the build outright:

| What it does                                                                                                                | What goes wrong without it                                                                                  |
| :-------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| Emits the wasm the adapter depends on to `wa-sqlite/wa-sqlite.wasm` at the artifact root                                    | The wasm is not found at database creation                                                                  |
| Rewrites the `import.meta.url` inside `@subframe7536/sqlite-wasm`'s glue to an empty string                                 | Miniprograms have no `import.meta`; vite would also inline the ~0.7 MB wasm into the code package as base64 |
| Douyin: rewrites free-standing `globalThis` in the artifact to the real global object registered at entry (`rxdb-realm.js`) | In Douyin modules `globalThis` is `undefined`; comlink's module top level throws a TypeError on load        |
| Raises the build target to `es2020` when it is still Taro's hardcoded `es6`                                                 | The vite 4 in the Taro 4.3 template cannot rewrite RxDB's BigInt literals under es6; the build errors       |

The wasm goes through vite's `emitFile`, landing relative to `outputRoot` — no dependency on `copy.patterns`. The Douyin entry `app.js` must be non-strict mode; with `use strict` the build fails.

### What it does not do

- **Does not override your `build.target`.** It only raises it when the build target is still Taro's hardcoded `es6` (`enforce: 'post'`, running after Taro); if you set another value in `compiler.vitePlugins`, yours wins. The adapter requires native `BigInt` anyway, so raising to es2020 does not narrow support.
- **Does not manage babel.** Projects using decorators own their babel configuration.
- Changes configuration only through Taro's `modifyRunnerOpts`: it is awaited before the runner starts; `modifyViteConfig` is not awaited, and queued after async plugins it races vite reading the configuration.

## Build-time failures

- `TARO_ENV` is not `weapp` / `tt`: errors outright, listing the supported platforms (Alipay — see [below](#alipay-experimental)).
- The compiler is not vite (including the default webpack5): errors outright.
- `compiler.vitePlugins` is not an array: errors outright (Taro would treat it as unset, and the plugin would silently never attach).
- The app root cannot resolve `@aiao/rxdb-adapter-miniprogram`: errors at the very start of the build.

## Runtime entry

In the miniprogram logic layer, pick the adapter host and platform WASM runtime by build platform (the package's `/runtime` subpath) — no hand-written `wx` / `tt` branching:

```ts
import { prepareMiniProgramHostRuntime } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { taroMiniProgramRuntime } from '@aiao/rxdb-taro/runtime';

const { host, wasmRuntime } = taroMiniProgramRuntime();
await prepareMiniProgramHostRuntime(host);
// Then create the database per the miniprogram adapter: new RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime })
```

- Platform detection is a literal comparison with `process.env.TARO_ENV`; Taro replaces it with a constant at build time, and the other platform's branch — along with the globals it reads — is tree-shaken away: no `typeof tt` / `TTWebAssembly` in the WeChat artifact, no `typeof wx` / `WXWebAssembly` in the Douyin artifact.
- A missing platform global errors outright, with no fallback to the other platform; with `WXWebAssembly` / `TTWebAssembly` missing, `wasmRuntime` is `undefined` and the adapter's runtime precheck reports what is missing.
- Do not pass `runtimeGlobal` for Douyin: the Taro plugin already points the artifact's free-standing `globalThis` at the real global object.
- Only `weapp` / `tt` are supported; Alipay needs a Worker random source and runtime patching — assemble it yourself per the [miniprogram adapter's Alipay section](/adapters/miniprogram.md#alipay).

## Alipay (experimental)

The Taro plugin does not enable Alipay: Alipay still needs lazy-loaded subpackages, tagged `var` hoisting, and the plugin-untouchable `workers` in `app.config.ts` and `compileOptions.transpile` in `project.alipay.json` (see the [miniprogram adapter's Alipay section](/adapters/miniprogram.md#alipay)). Of these, the wasm, the base64 copy, the random-number Worker, the real-global-object registration, and the build target (Taro's `es6` raised to the tested `es2018`) are assembled by `@aiao/rxdb-taro/vite`:

```ts
// config/index.ts
import { miniProgramVitePlugins } from '@aiao/rxdb-taro/vite';

export default defineConfig<'vite'>({
  compiler: {
    type: 'vite',
    // Taro treats the launch directory as the app root
    vitePlugins: [...miniProgramVitePlugins('alipay', process.cwd()) /* lazy-loaded subpackages etc. */]
  }
});
```

The Worker's path inside the code package is exported as `ALIPAY_WORKER_PATH` (`workers/index.js`).

`miniProgramVitePlugins(platform, appRoot)` also accepts `weapp` / `tt`, for projects that assemble their own vite configuration instead of the Taro plugin mechanism.

## Known environment issues

- The Taro 4.3 React template, installed with pnpm, fails the build with a missing `@babel/plugin-proposal-decorators` (unrelated to this package; the pristine template fails the same way). Install `pnpm add -D @babel/plugin-proposal-decorators@^7`; version 8.x errors that the decorators plugin lacks the `version` option.

## Version commitment

Only the tested Taro 4.3.x is committed to: the `modifyRunnerOpts` configuration shape the plugin depends on is not a publicly documented Taro contract, so re-verify after upgrading Taro.

## Related pages

- [Miniprogram adapter (experimental)](/adapters/miniprogram.md)
- [Database adapters](/adapters/README.md)

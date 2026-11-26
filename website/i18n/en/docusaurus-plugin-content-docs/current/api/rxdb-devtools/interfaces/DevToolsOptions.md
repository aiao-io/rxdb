# DevToolsOptions

Defined in: [connector-types.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L155)

The RxDB DevTools configuration options.

## Properties

### allowOpaqueOrigin? \{#allowopaqueorigin\}

```ts
allowOpaqueOrigin?: boolean;
```

Defined in: [connector-types.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L216)

Whether to allow broadcasting messages with `'*'` under an opaque origin (`location.origin === 'null'`).

#### Default Value

```ts
false;
```

#### Remarks

The connector always uses `location.origin` as the `targetOrigin`. The origin of sandbox iframes and `data:`/`blob:` documents is opaque, `location.origin` evaluates to the string `'null'`, and `postMessage(msg, 'null')` fails silently — the message never arrives and no error is reported.

The default policy is to **fail explicitly**: [DevToolsConnector.init](../classes/DevToolsConnector.md#init) logs a warning once and stays disabled, rather than quietly falling back to `'*'` and broadcasting messages to every frame on the page. If debugging inside a sandbox is truly needed, set this option to `true` to explicitly accept that risk.

---

### capabilities? \{#capabilities\}

```ts
capabilities?: DevToolsCapability;
```

Defined in: [connector-types.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L186)

The command capability tier granted to DevTools.

#### Default Value

```ts
'full';
```

#### Remarks

The default of `'full'` exists to avoid breaking already-published extension panels (they rely on SWITCH/CREATE/DELETE_BRANCH). Production environments should explicitly lower it to `'readonly'` or `'none'` — the page message bus is fully open to same-origin scripts, and the tier determines the most a forged command can do. For the semantics see [DevToolsCapability](../type-aliases/DevToolsCapability.md).

---

### enabled? \{#enabled\}

```ts
enabled?: boolean;
```

Defined in: [connector-types.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L175)

Whether the connector is enabled.

#### Default Value

```ts
true;
```

#### Remarks

When `false`, [DevToolsConnector.init](../classes/DevToolsConnector.md#init) returns immediately: no message listener is registered, no RxDB events are subscribed, and no global helper is attached. Turning it off in production builds fully eliminates the exposure surface of "entity data appearing on the page message bus".

---

### i18n? \{#i18n\}

```ts
i18n?: DevToolsI18nPort;
```

Defined in: [connector-types.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L157)

The i18n instance explicitly provided by the current application; when omitted, protocol behavior stays as-is.

---

### maxBufferSize? \{#maxbuffersize\}

```ts
maxBufferSize?: number;
```

Defined in: [connector-types.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L164)

The upper bound on the number of events buffered before the handshake completes; beyond it the oldest are dropped FIFO.

#### Default Value

```ts
100;
```

#### Throws

RangeError when a non-positive safe integer is passed at construction.

---

### mutationPolicy? \{#mutationpolicy\}

```ts
mutationPolicy?: DevToolsMutationPolicy;
```

Defined in: [connector-types.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L201)

Whether the page opens the write path of the v2 data plane for this run.

#### Default Value

```ts
'omit';
```

#### Remarks

This and [DevToolsOptions.capabilities](#capabilities) are switches of two different decision makers and cannot be merged into one: the tier says "how heavy a command the panel is allowed to issue", while this option says "whether the page is willing to be written to disk". Merged, raising the tier to `'full'` so the panel can list directories would open deletion, upload and directory creation along with it.

The default `'omit'`: attaching a provider only means **readable**, and writes require an explicit statement from the owner. When rejected, the peer receives `provider_unsupported` — the same shape as "this domain does not exist", so which write capabilities the page has enabled is not leaked (see [DevToolsMutationPolicy](../type-aliases/DevToolsMutationPolicy.md)).

---

### providers? \{#providers\}

```ts
providers?: DevToolsProviderOptions;
```

Defined in: [connector-types.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L226)

The provider assembly ports for native hosts (Electron / Tauri).

#### Remarks

When omitted, the connector auto-detects in browser form (OPFS `files` + browser `settings` + `runtime: browser`). Desktop hosts must give it explicitly: the native files backend (`nativeFiles`), the semantic kind of `settings` (`sqlite`), and the display `runtime`. Omitting any of them does not "guess one" as a fallback — it falls back to the browser form.

---

### transport? \{#transport\}

```ts
transport?: DevToolsConnectorTransport;
```

Defined in: [connector-types.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L236)

The connector's transport layer; defaults to the browser implementation (window bus + MessageChannel private port).

#### Remarks

Tauri and other hosts without a shared `window` must explicitly provide a host transport (such as `invoke`/`listen`); otherwise the connector still sends `window.postMessage` as in the browser and the panel side never receives anything. The default keeps browser behavior and does not break the existing three-framework demos.

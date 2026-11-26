# SupabaseRlsCheckOptions

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L16)

## Properties

### failureMode? \{#failuremode\}

```ts
failureMode?: "warn" | "throw";
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L21)

On a failed check, only warn or directly block the connection

---

### rpcName? \{#rpcname\}

```ts
rpcName?: string;
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L18)

The RPC name used by the self-check

---

### tables? \{#tables\}

```ts
tables?: SupabaseRlsCheckTable[];
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L24)

The custom tables to check; derived from rxdb.entities by default

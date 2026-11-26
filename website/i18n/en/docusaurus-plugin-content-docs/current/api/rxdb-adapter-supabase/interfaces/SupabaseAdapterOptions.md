# SupabaseAdapterOptions

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L34)

Supabase Adapter configuration options

Two initialization approaches are supported:
1. Pass URL + Key; the adapter creates the client internally
2. Pass an existing SupabaseClient instance to reuse the current client

## Extends

- [`IRxDBAdapterOptions`](../../rxdb/type-aliases/IRxDBAdapterOptions.md)

## Properties

### client? \{#client\}

```ts
client?: SupabaseClient<any, "public", "public", any, any>;
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L42)

The custom Supabase client (taking priority over URL + Key)

***

### rlsCheck? \{#rlscheck\}

```ts
rlsCheck?: boolean | SupabaseRlsCheckOptions;
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L56)

Runs the RLS self-check at connect.

- `false`: disables the self-check
- `true` / `undefined`: uses the default RPC `rxdb_check_rls`, warning on failure without interrupting the connection
- `object`: customizes the RPC, failure mode, or the checked table list

#### Remarks

The self-check only confirms target tables exist and have RLS enabled. The
transaction-write RPCs run with `SECURITY INVOKER`, so target-table privileges
and RLS policies are judged by the caller's identity, with no `FORCE ROW LEVEL
SECURITY` requirement. The self-check does not verify policy contents, auth
claims, tenant ownership, or table-level grants.

***

### supabaseKey? \{#supabasekey\}

```ts
supabaseKey?: string;
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L39)

The Supabase API key (used with supabaseUrl)

***

### supabaseUrl? \{#supabaseurl\}

```ts
supabaseUrl?: string;
```

Defined in: [packages/rxdb-adapter-supabase/src/supabase.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/supabase.interface.ts#L36)

The Supabase project URL (used with supabaseKey)

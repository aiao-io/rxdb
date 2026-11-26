# SupabaseDataErrorOptions

Defined in: [packages/rxdb-adapter-supabase/src/errors.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/errors.ts#L68)

The fields [SupabaseDataError](../classes/SupabaseDataError.md) keeps from the database error body

## Properties

### code? \{#code\}

```ts
readonly code?: string;
```

Defined in: [packages/rxdb-adapter-supabase/src/errors.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/errors.ts#L70)

The error code returned by the database / PostgREST, e.g. SQLSTATE `42501`, `RX001`, or PostgREST's `PGRST202`

***

### details? \{#details\}

```ts
readonly details?: string;
```

Defined in: [packages/rxdb-adapter-supabase/src/errors.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/errors.ts#L72)

The database error's `DETAIL`; errors thrown by rxdb itself (like `RX001`) put JSON-form location info here

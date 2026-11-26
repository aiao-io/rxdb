# timezoneOptions()

```ts
function timezoneOptions(current, now): PreferenceOption[];
```

Defined in: [widgets/timezone.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/timezone.ts#L146)

The options of the "Timezone" dropdown in the preferences drawer: the first entry follows the browser, followed by common timezones; when the current value is not in the common list (e.g. an imported configuration) an extra entry is added.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `current` | `string` | The current preference value. |
| `now` | `Date` | The moment. |

## Returns

[`PreferenceOption`](../interfaces/PreferenceOption.md)[]

The options.

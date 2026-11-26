# IS_BROWSER

```ts
const IS_BROWSER: boolean;
```

Defined in: [packages/utils/src/platform/is-browser.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/platform/is-browser.ts#L17)

Detects whether the current runtime is a browser environment
Determined by checking whether the global window object exists

**Constant:**  \{boolean\} IS_BROWSER - whether running in a browser environment

## Example

```ts
if (IS_BROWSER) {
  // code for the browser environment
  console.log('running in a browser');
} else {
  // Node.js or other environments
  console.log('not running in a browser');
}
**Note:** this detection is based on the existence of the window object and may be inaccurate in some special environments
**Note:** in SSR (server-side rendering) environments, this value is false on the server and true on the client
```

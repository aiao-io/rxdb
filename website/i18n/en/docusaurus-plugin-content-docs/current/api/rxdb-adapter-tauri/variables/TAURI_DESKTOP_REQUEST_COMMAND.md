# TAURI_DESKTOP_REQUEST_COMMAND

```ts
const TAURI_DESKTOP_REQUEST_COMMAND: 'rxdb_desktop_request' = 'rxdb_desktop_request';
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L26)

Name of the Rust-side `#[tauri::command]`.

## Remarks

App-defined commands registered via `generate_handler!` are not subject to capability gating, so
connecting the desktop database does **not** require granting the app any of the `sql` / `fs` /
`shell` plugin permissions (AC#1).

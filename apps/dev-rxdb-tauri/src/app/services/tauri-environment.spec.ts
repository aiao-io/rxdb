import { isTauriRuntime } from './tauri-environment';

describe('isTauriRuntime', () => {
  it.each([undefined, null, {}, { __TAURI_INTERNALS__: undefined }])('detects %j', value => {
    expect(isTauriRuntime(value)).toBe(value !== null && typeof value === 'object' && '__TAURI_INTERNALS__' in value);
  });
});

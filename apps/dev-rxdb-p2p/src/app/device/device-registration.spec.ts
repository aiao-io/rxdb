import { describe, expect, it, vi } from 'vitest';
import { defaultDeviceName, deviceStorageKey, ensureDevice, type DeviceApi } from './device-registration';

const USER = 'user-1';

const storeWith = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    map
  };
};

const apiWith = (devices: Record<string, string>): DeviceApi & { readonly registered: string[] } => {
  const registered: string[] = [];
  return {
    registered,
    findDevice: vi.fn(async (id: string) => (devices[id] ? { id, name: devices[id] } : null)),
    registerDevice: vi.fn(async (name: string, publicKeyBase64: string) => {
      registered.push(name);
      return { id: `device-${registered.length}`, name };
    }),
    setPublicKey: vi.fn(async () => undefined)
  };
};

const PUBLIC_KEY = 'a-public-key';

describe('ensureDevice', () => {
  it('registers this browser on first sign-in and remembers the device per user', async () => {
    const store = storeWith();
    const api = apiWith({});

    const device = await ensureDevice(USER, store, api, 'Chrome · macOS', PUBLIC_KEY);

    expect(device).toEqual({ id: 'device-1', name: 'Chrome · macOS' });
    expect(store.map.get(deviceStorageKey(USER))).toBe('device-1');
    expect(api.registerDevice).toHaveBeenCalledWith('Chrome · macOS', PUBLIC_KEY);
  });

  it('reuses the remembered device while it is still registered, and keeps its public key current', async () => {
    const store = storeWith({ [deviceStorageKey(USER)]: 'device-7' });
    const api = apiWith({ 'device-7': 'Laptop' });

    await expect(ensureDevice(USER, store, api, 'ignored', PUBLIC_KEY)).resolves.toEqual({
      id: 'device-7',
      name: 'Laptop'
    });
    expect(api.registered).toEqual([]);
    expect(api.setPublicKey).toHaveBeenCalledWith('device-7', PUBLIC_KEY);
  });

  it('registers again when the remembered device was deleted', async () => {
    const store = storeWith({ [deviceStorageKey(USER)]: 'device-7' });
    const api = apiWith({});

    await expect(ensureDevice(USER, store, api, 'Firefox · Linux', PUBLIC_KEY)).resolves.toEqual({
      id: 'device-1',
      name: 'Firefox · Linux'
    });
    expect(store.map.get(deviceStorageKey(USER))).toBe('device-1');
  });
});

describe('defaultDeviceName', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      'Chrome · macOS'
    ],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox · Windows'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Safari · macOS'
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0',
      'Edge · Linux'
    ],
    ['curl/8.0', 'Browser · Device']
  ])('names %s', (userAgent, expected) => {
    expect(defaultDeviceName(userAgent)).toBe(expected);
  });
});

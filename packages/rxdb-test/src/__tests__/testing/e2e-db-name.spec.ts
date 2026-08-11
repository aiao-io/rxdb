import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getE2eDbName } from '../../testing/e2e-db-name.js';

/** Node.js 26 实验性 localStorage 全局变量会返回 undefined，覆盖 happy-dom 的设置 */
function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null)
  } as unknown as Storage;
}

const mockLocalStorage = createMockStorage();
const mockSessionStorage = createMockStorage();

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
    configurable: true
  });
  mockLocalStorage.clear();
  mockSessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockLocalStorage.clear();
  mockSessionStorage.clear();
});

describe('getE2eDbName', () => {
  it('keeps the default name during SSR', () => {
    vi.stubGlobal('window', undefined);

    expect(getE2eDbName('demo')).toBe('demo');
  });

  it('keeps the default name outside e2e', () => {
    expect(getE2eDbName('demo', { isE2e: () => false })).toBe('demo');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('creates and reuses one isolated name in the configured storage', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const options = {
      storage: window.localStorage,
      storageKey: 'custom-e2e-name',
      isE2e: () => true
    };

    const created = getE2eDbName('demo', options);
    const reused = getE2eDbName('other-default', options);

    expect(created).toMatch(/^demo_pw_[a-z0-9]+_[a-z0-9]+$/);
    expect(window.localStorage.getItem('custom-e2e-name')).toBe(created);
    expect(reused).toBe(created);
  });

  it('uses webdriver, sessionStorage, and the default key when options are omitted', () => {
    vi.spyOn(window.navigator, 'webdriver', 'get').mockReturnValue(true);
    vi.spyOn(Date, 'now').mockReturnValue(4321);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    const created = getE2eDbName('demo');

    expect(created).toMatch(/^demo_pw_[a-z0-9]+_[a-z0-9]+$/);
    expect(window.sessionStorage.getItem('__aiao_e2e_db_name__')).toBe(created);
  });
});

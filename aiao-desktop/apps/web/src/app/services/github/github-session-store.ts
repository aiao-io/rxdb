/** 持久化的登录会话；token 以 AES-GCM 密封后写入 IndexedDB。 */
export interface GitHubStoredSession {
  readonly token: string;
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly provider: 'pat' | 'oauth';
  readonly createdAt: number;
}

export interface GitHubSecretStore<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
  clear(): Promise<void>;
}

export type GitHubSessionStore = GitHubSecretStore<GitHubStoredSession>;

/** 进程内会话存储；单测与无持久化环境使用。 */
export function createMemorySessionStore(): GitHubSessionStore {
  let session: GitHubStoredSession | null = null;
  return {
    load: async () => session,
    save: async next => {
      session = next;
    },
    clear: async () => {
      session = null;
    }
  };
}

const KEY_STORE = 'key';
const SESSION_KEY = 'session';

/** 打开（必要时创建）会话数据库。 */
function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
      if (!database.objectStoreNames.contains('sessions')) database.createObjectStore('sessions');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开会话存储'));
  });
}

function getRecord<T>(database: IDBDatabase, store: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readonly');
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('读取会话存储失败'));
  });
}

function putRecord(database: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('写入会话存储失败'));
  });
}

function deleteRecord(database: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('清除会话存储失败'));
  });
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey;
}

function rawKeyBytes(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (value instanceof Uint8Array) return new Uint8Array(value) as Uint8Array<ArrayBuffer>;
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0)) as Uint8Array<ArrayBuffer>;
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return null;
  if (!value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) return null;
  return new Uint8Array(value) as Uint8Array<ArrayBuffer>;
}

async function importRawKey(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** 用不可导出的 AES-GCM 密钥密封会话，密钥本身由 IndexedDB 以 CryptoKey 形式保存。 */
async function seal<T>(key: CryptoKey, value: T): Promise<string> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  const packed = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
  return btoa(String.fromCharCode(...packed));
}

async function unseal<T>(key: CryptoKey, sealed: string): Promise<T> {
  const binary = atob(sealed);
  if (binary.length < 28) throw new Error('会话密文无效');
  const packed = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) packed[index] = binary.charCodeAt(index);
  const iv: Uint8Array<ArrayBuffer> = packed.slice(0, 12);
  const data: Uint8Array<ArrayBuffer> = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/**
 * IndexedDB 会话存储。不可导出的 AES-GCM 密钥与密文都保存在同源 IndexedDB 中，令牌不进入 URL 或 localStorage。
 */
export function createIndexedDbSecretStore<T>(databaseName: string): GitHubSecretStore<T> {
  const database = openDatabase(databaseName);

  async function encryptionKey(): Promise<CryptoKey> {
    const db = await database;
    const create = async (): Promise<CryptoKey> => {
      const current = await getRecord<unknown>(db, KEY_STORE, 'aes-gcm');
      if (isCryptoKey(current)) return current;

      const legacy = current === null ? await getRecord<unknown>(db, KEY_STORE, 'aes') : current;
      const legacyBytes = rawKeyBytes(legacy);
      if (legacyBytes) {
        const migrated = await importRawKey(legacyBytes);
        await putRecord(db, KEY_STORE, 'aes-gcm', migrated);
        if (current === null) await deleteRecord(db, KEY_STORE, 'aes');
        return migrated;
      }

      const next = (await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )) as CryptoKey;
      await putRecord(db, KEY_STORE, 'aes-gcm', next);
      return next;
    };
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(`aiao-github-session-key:${databaseName}`, create) : create();
  }

  return {
    async load(): Promise<T | null> {
      const db = await database;
      const sealed = await getRecord<string>(db, 'sessions', SESSION_KEY);
      if (!sealed) return null;
      try {
        return await unseal<T>(await encryptionKey(), sealed);
      } catch {
        await deleteRecord(db, 'sessions', SESSION_KEY);
        return null;
      }
    },
    async save(value: T): Promise<void> {
      const db = await database;
      await putRecord(db, 'sessions', SESSION_KEY, await seal(await encryptionKey(), value));
    },
    async clear(): Promise<void> {
      const db = await database;
      await deleteRecord(db, 'sessions', SESSION_KEY);
    }
  };
}

export function createIndexedDbSessionStore(databaseName = 'aiao-vscode-github-auth'): GitHubSessionStore {
  const store = createIndexedDbSecretStore<GitHubStoredSession>(databaseName);
  return {
    ...store,
    async load(): Promise<GitHubStoredSession | null> {
      const session = await store.load();
      if (!session) return null;
      if (
        typeof session.token !== 'string' ||
        !session.token ||
        typeof session.login !== 'string' ||
        !session.login ||
        (session.provider !== 'pat' && session.provider !== 'oauth')
      ) {
        await store.clear();
        return null;
      }
      return session;
    }
  };
}

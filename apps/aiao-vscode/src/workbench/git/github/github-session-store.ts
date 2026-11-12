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
      request.result.createObjectStore(KEY_STORE);
      request.result.createObjectStore('sessions');
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

/** 用 AES-GCM 密封会话；密钥只存在内存，落盘的是随机密钥字节 + 密文。 */
async function seal<T>(keyBytes: Uint8Array<ArrayBuffer>, value: T): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new Uint8Array(new TextEncoder().encode(JSON.stringify(value)))
  );
  const packed = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
  return btoa(String.fromCharCode(...packed));
}

async function unseal<T>(keyBytes: Uint8Array<ArrayBuffer>, sealed: string): Promise<T> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const binary = atob(sealed);
  const packed = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) packed[index] = binary.charCodeAt(index);
  const iv: Uint8Array<ArrayBuffer> = packed.slice(0, 12);
  const data: Uint8Array<ArrayBuffer> = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/**
 * IndexedDB 会话存储。AES-GCM 密封防静态翻查，安全边界仍靠同源隔离：
 * 预览 iframe 是独立 origin，无法访问这里的存储。
 */
export function createIndexedDbSecretStore<T>(databaseName: string): GitHubSecretStore<T> {
  const database = openDatabase(databaseName);

  async function keyBytes(): Promise<Uint8Array<ArrayBuffer>> {
    const db = await database;
    const existing = await getRecord<Uint8Array<ArrayBuffer>>(db, KEY_STORE, 'aes');
    if (existing) return existing;
    const next = randomBytes(32);
    await putRecord(db, KEY_STORE, 'aes', next);
    return next;
  }

  return {
    async load(): Promise<T | null> {
      const db = await database;
      const sealed = await getRecord<string>(db, 'sessions', SESSION_KEY);
      if (!sealed) return null;
      return unseal<T>(await keyBytes(), sealed);
    },
    async save(value: T): Promise<void> {
      const db = await database;
      await putRecord(db, 'sessions', SESSION_KEY, await seal(await keyBytes(), value));
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
      if (typeof session.token !== 'string' || typeof session.login !== 'string') {
        await store.clear();
        return null;
      }
      return session;
    }
  };
}

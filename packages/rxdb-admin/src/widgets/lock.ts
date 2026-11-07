import type { StorageLike } from '../storage.js';
import { Store, type ReadableStore } from '../store.js';

/** 密码哈希。 */
export interface PasswordHasher {
  /**
   * 对密码加盐哈希。
   * @param password - 明文。
   * @param salt - 盐（十六进制）。
   * @returns 哈希（十六进制）。
   */
  hash(password: string, salt: string): Promise<string>;
}

const PBKDF2_ITERATIONS = 100_000;

const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * 基于 Web Crypto 的 PBKDF2-SHA256 哈希。
 * @returns 哈希器。
 * @throws 调用时环境没有 `crypto.subtle`（非 HTTPS 且非 localhost）则抛错，不做弱哈希退让。
 */
export const webCryptoHasher: PasswordHasher = {
  async hash(password, salt) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable: the lock screen password requires HTTPS or localhost');
    const encoder = new TextEncoder();
    const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS },
      key,
      256
    );
    return toHex(new Uint8Array(bits));
  }
};

/** 锁屏状态的默认存储键。 */
export const LOCK_STATE_KEY = 'aiao.admin.lock';
/** 锁屏密码的默认存储键。 */
export const LOCK_PASSWORD_KEY = 'aiao.admin.lock.password';

/** {@link LockController} 的构造选项。 */
export interface LockControllerOptions {
  /** 持久化介质，建议用 localStorage 使多个标签页同时锁定。 */
  readonly storage: StorageLike;
  /** 锁定状态的存储键，缺省 {@link LOCK_STATE_KEY}。 */
  readonly stateKey?: string;
  /** 密码的存储键，缺省 {@link LOCK_PASSWORD_KEY}。 */
  readonly passwordKey?: string;
  /** 哈希器，缺省 {@link webCryptoHasher}。 */
  readonly hasher?: PasswordHasher;
  /** 生成盐，缺省使用 `crypto.getRandomValues`。 */
  readonly createSalt?: () => string;
  /** 宿主事件源，用于跨标签同步锁定状态。 */
  readonly host?: {
    addEventListener(type: 'storage', listener: (event: { key?: string | null }) => void): void;
    removeEventListener(type: 'storage', listener: (event: { key?: string | null }) => void): void;
  };
}

const randomSalt = (): string => toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));

/**
 * 锁屏：遮住界面，密码解锁。
 *
 * @remarks
 * 这是「防偷看」而不是安全边界：密码哈希与锁定状态都在本机存储里，数据本身并未加密。
 * 锁定状态持久化并跨标签同步，刷新页面或新开标签不能绕过。
 */
export class LockController {
  readonly #options: LockControllerOptions;
  readonly #state: Store<boolean>;
  readonly #stateKey: string;
  readonly #passwordKey: string;

  /** 是否处于锁定状态。 */
  get locked(): ReadableStore<boolean> {
    return this.#state;
  }

  /**
   * 创建控制器并读取已保存的锁定状态。
   * @param options - 存储、哈希器与宿主。
   */
  constructor(options: LockControllerOptions) {
    this.#options = options;
    this.#stateKey = options.stateKey ?? LOCK_STATE_KEY;
    this.#passwordKey = options.passwordKey ?? LOCK_PASSWORD_KEY;
    this.#state = new Store(this.#readLocked());
    options.host?.addEventListener('storage', this.#onStorage);
  }

  /** 是否已设置锁屏密码；未设置时锁屏界面要求先设置。 */
  hasPassword(): boolean {
    return this.#options.storage.getItem(this.#passwordKey) !== null;
  }

  /** 锁定界面。 */
  lock(): void {
    this.#options.storage.setItem(this.#stateKey, '1');
    this.#state.set(true);
  }

  /**
   * 设置（或更换）锁屏密码并解锁。
   * @param password - 明文密码。
   * @throws 密码为空，或环境缺少 Web Crypto 时抛错。
   */
  async setPassword(password: string): Promise<void> {
    if (password === '') throw new Error('Lock screen password must not be empty');
    const salt = (this.#options.createSalt ?? randomSalt)();
    const hash = await (this.#options.hasher ?? webCryptoHasher).hash(password, salt);
    this.#options.storage.setItem(this.#passwordKey, JSON.stringify({ salt, hash }));
    this.unlock();
  }

  /**
   * 校验密码并解锁。
   * @param password - 明文密码。
   * @returns 正确并已解锁为 `true`；未设置密码或错误为 `false`。
   */
  async unlockWith(password: string): Promise<boolean> {
    const stored = this.#readPassword();
    if (!stored) return false;
    const hash = await (this.#options.hasher ?? webCryptoHasher).hash(password, stored.salt);
    if (hash !== stored.hash) return false;
    this.unlock();
    return true;
  }

  /** 直接解锁（不校验）。 */
  unlock(): void {
    this.#options.storage.removeItem(this.#stateKey);
    this.#state.set(false);
  }

  /** 忘记密码：清除密码并解锁。数据不受影响。 */
  resetPassword(): void {
    this.#options.storage.removeItem(this.#passwordKey);
    this.unlock();
  }

  /** 停止跨标签监听。 */
  destroy(): void {
    this.#options.host?.removeEventListener('storage', this.#onStorage);
  }

  #readLocked(): boolean {
    return this.#options.storage.getItem(this.#stateKey) === '1';
  }

  #readPassword(): { salt: string; hash: string } | null {
    try {
      const parsed = JSON.parse(this.#options.storage.getItem(this.#passwordKey) ?? 'null') as {
        salt?: unknown;
        hash?: unknown;
      } | null;
      return typeof parsed?.salt === 'string' && typeof parsed.hash === 'string' ?
          { salt: parsed.salt, hash: parsed.hash }
        : null;
    } catch {
      return null;
    }
  }

  readonly #onStorage = (event: { key?: string | null }): void => {
    if (event.key === null || event.key === this.#stateKey) this.#state.set(this.#readLocked());
  };
}

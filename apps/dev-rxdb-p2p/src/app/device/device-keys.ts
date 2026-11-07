/**
 * 设备密钥对（POOL-US-101）：每台设备一把 ECDH P-256 密钥，私钥只存本机存储，公钥登记进设备表。
 *
 * @remarks
 * 私钥不进同步、备份与日志；浏览器清数据即丢，丢失后本设备解不开既有信封，需要上传方在线时重新封装。
 */
import { generateDeviceKeyPair, type DeviceKeyPair } from '../p2p/fallback-crypto';

/** 记住密钥对的存储（生产传 `localStorage`）。 */
export interface DeviceKeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 本浏览器为某用户记住的密钥对的键。 */
export const deviceKeysStorageKey = (userId: string): string => `dev-rxdb-p2p:keys:${userId}`;

/** 本用户在本浏览器登记的设备密钥对。 */
export interface StoredDeviceKeys {
  readonly publicKeyBase64: string;
  readonly privateKeyJwk: JsonWebKey;
}

const isStoredDeviceKeys = (value: unknown): value is StoredDeviceKeys => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredDeviceKeys>;
  return (
    typeof candidate.publicKeyBase64 === 'string' &&
    typeof candidate.privateKeyJwk === 'object' &&
    candidate.privateKeyJwk !== null
  );
};

/**
 * 取得本浏览器为当前用户持有的设备密钥对，没有就生成一对并记住。
 *
 * @remarks 生成失败（WebCrypto 不可用）时抛错，调用方把它当启动失败处理。
 */
export const ensureDeviceKeyPair = async (userId: string, store: DeviceKeyStore): Promise<DeviceKeyPair> => {
  const remembered = store.getItem(deviceKeysStorageKey(userId));
  if (remembered) {
    try {
      const parsed: unknown = JSON.parse(remembered);
      if (isStoredDeviceKeys(parsed)) {
        return { publicKeyBase64: parsed.publicKeyBase64, privateKeyJwk: parsed.privateKeyJwk };
      }
    } catch {
      // 记坏了就当没有，重新生成
    }
  }
  const pair = await generateDeviceKeyPair();
  store.setItem(deviceKeysStorageKey(userId), JSON.stringify(pair));
  return pair;
};

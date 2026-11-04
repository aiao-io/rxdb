/**
 * 设备登记（US-704 认证合同）：每个浏览器 profile 是一台设备，登记在 Supabase 的 `p2p.devices`，
 * `deviceId` 即其主键。本地只记「这个用户在本浏览器登记的是哪台设备」，设备是否属于该用户由 RLS 回答。
 */

/** 登记过的设备。 */
export interface RegisteredDevice {
  readonly id: string;
  readonly name: string;
}

/** 设备登记表的读写。 */
export interface DeviceApi {
  /** 查本人的一台设备；不存在或不属于本人时为 null。 */
  findDevice(id: string): Promise<RegisteredDevice | null>;
  /** 为本人登记一台新设备。 */
  registerDevice(name: string): Promise<RegisteredDevice>;
}

/** 记住设备 ID 的存储（生产传 `localStorage`）。 */
export interface DeviceIdStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 本浏览器为某用户记住的设备 ID 的键。 */
export const deviceStorageKey = (userId: string): string => `dev-rxdb-p2p:device:${userId}`;

/**
 * 取得本浏览器为当前用户登记的设备，没有就登记一台。
 *
 * @param name - 首次登记时的设备名
 */
export const ensureDevice = async (
  userId: string,
  store: DeviceIdStore,
  api: DeviceApi,
  name: string
): Promise<RegisteredDevice> => {
  const remembered = store.getItem(deviceStorageKey(userId));
  const existing = remembered ? await api.findDevice(remembered) : null;
  if (existing) return existing;
  const device = await api.registerDevice(name);
  store.setItem(deviceStorageKey(userId), device.id);
  return device;
};

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari']
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux']
];

const pick = (userAgent: string, table: ReadonlyArray<readonly [RegExp, string]>, unknown: string): string =>
  table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? unknown;

/** 由 User-Agent 起一个默认设备名，例如 `Chrome · macOS`。 */
export const defaultDeviceName = (userAgent: string): string =>
  `${pick(userAgent, BROWSERS, 'Browser')} · ${pick(userAgent, SYSTEMS, 'Device')}`;

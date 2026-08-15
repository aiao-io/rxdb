/**
 * @fileoverview 逻辑名 ↔ 物理文件名的确定性可逆编码
 *
 * @remarks
 * OPFS 几乎接受任意名称，原生文件系统不接受：Windows 拒绝 `? * : " < > | \ /`，
 * 会静默吃掉结尾的点和空格，还把 `CON` / `NUL` 之类当设备名。直接用逻辑名落盘，
 * 桌面后端会在这些名字上失败或悄悄改名。
 *
 * 因此这里做一层编码，而**不是**收窄逻辑字符集 —— 浏览器上已经存在的文件名不能变得非法
 * （Never break userspace）。编码必须满足两条硬性质：
 * - **可逆**：{@link decodePhysicalName} 能从物理名精确还原逻辑名。
 *   `listEntries` / `copyDirectory` 靠枚举物理名回推逻辑路径，不可逆就会错位。
 * - **单射**：不同逻辑名不得编码成同一物理名，否则两个文件会互相覆盖。
 *   这正是 `%` 自身也必须转义的原因。
 *
 * 长度超限时**以错误拒绝，不做哈希截断** —— 截断不可逆，会直接打破上面第一条。
 *
 * @module rxdb-plugin-storage/filesystem/physical-name
 */

import { StorageBackendError } from '../errors.js';

/**
 * 单个路径分段编码后允许的最大 UTF-8 字节数。
 *
 * @remarks
 * 255 是 ext4 / APFS / NTFS 的共同下限，按字节而非字符计 ——
 * 一个中文字符占 3 字节，按字符判定会在中文名上放过超限的名字。
 */
export const MAX_PHYSICAL_NAME_BYTES = 255;

/** 需要转义的字符：Windows 非法字符集，外加转义符自身。 */
const ESCAPED_CHARACTERS = new Set(['%', '<', '>', ':', '"', '/', '\\', '|', '?', '*']);

/** Windows 保留设备名（不含扩展名部分），比对时统一转大写。 */
const RESERVED_BASE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)
]);

const UTF8_ENCODER = new TextEncoder();

/** 把单个 ASCII 字符转成 `%XX` 形式。 */
const escapeCharacter = (character: string): string =>
  `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;

/** 判断是否落在 Windows 保留设备名上（`NUL` 与 `NUL.txt` 同样被保留）。 */
const isReservedName = (name: string): boolean => {
  const dotIndex = name.indexOf('.');
  const baseName = dotIndex === -1 ? name : name.slice(0, dotIndex);
  return RESERVED_BASE_NAMES.has(baseName.toUpperCase());
};

/**
 * 把逻辑名编码成可安全落地到原生文件系统的物理名。
 *
 * @param logicalName - 单个路径分段（不含 `/`）。
 * @returns 编码后的物理名；本就安全的名称原样返回。
 * @throws {@link StorageBackendError} 名称为空（`invalid_physical_name`）
 *   或编码后超过 {@link MAX_PHYSICAL_NAME_BYTES}（`name_too_long`）。
 */
export const encodePhysicalName = (logicalName: string): string => {
  if (logicalName === '') {
    throw new StorageBackendError('invalid_physical_name', 'Physical name cannot be empty');
  }

  let encoded = '';
  for (const character of logicalName) {
    const isControlCharacter = character.length === 1 && character.charCodeAt(0) < 0x20;
    encoded += ESCAPED_CHARACTERS.has(character) || isControlCharacter ? escapeCharacter(character) : character;
  }

  // 结尾的点和空格被 Windows 静默剥掉：`a.` 与 `a` 会指向同一个文件。
  const lastCharacter = encoded.slice(-1);
  if (lastCharacter === '.' || lastCharacter === ' ') {
    encoded = encoded.slice(0, -1) + escapeCharacter(lastCharacter);
  }

  // 保留设备名转义首字符即可脱离保留集，同时保持可逆。
  if (isReservedName(encoded)) {
    encoded = escapeCharacter(encoded[0]) + encoded.slice(1);
  }

  const byteLength = UTF8_ENCODER.encode(encoded).byteLength;
  if (byteLength > MAX_PHYSICAL_NAME_BYTES) {
    throw new StorageBackendError(
      'name_too_long',
      `Encoded name exceeds ${MAX_PHYSICAL_NAME_BYTES} bytes (${byteLength}): ${logicalName}`
    );
  }

  return encoded;
};

/** 把 `%XX` 中的两位十六进制解析成字符码；非法时返回 `null`。 */
const parseEscapeCode = (hex: string): number | null => {
  if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
    return null;
  }
  return Number.parseInt(hex, 16);
};

/**
 * 把物理名还原成逻辑名。
 *
 * @param physicalName - {@link encodePhysicalName} 的输出。
 * @returns 原始逻辑名。
 * @throws {@link StorageBackendError} 转义序列残缺或指向非 ASCII 字节时抛出
 *   （`invalid_physical_name`）—— 这类名字不是本编码器产出的，
 *   硬解会得到与原逻辑名不同的字符串，属于静默数据损坏。
 */
export const decodePhysicalName = (physicalName: string): string => {
  let decoded = '';
  let index = 0;

  while (index < physicalName.length) {
    const character = physicalName[index];
    if (character !== '%') {
      decoded += character;
      index += 1;
      continue;
    }

    const code = parseEscapeCode(physicalName.slice(index + 1, index + 3));
    if (code === null || code > 0x7f) {
      throw new StorageBackendError('invalid_physical_name', `Malformed escape sequence in name: ${physicalName}`);
    }

    decoded += String.fromCharCode(code);
    index += 3;
  }

  return decoded;
};

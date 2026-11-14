/** 浏览器里无法真正生成的格式：只写带正确文件头的小文件，`file` 一类工具能认出类型。 */
export type StubFormat = 'mp4' | 'mov' | 'heic' | 'mp3' | 'xip' | 'dmg' | 'zip' | 'ttf';

const ascii = (text: string): number[] => Array.from(text, char => char.charCodeAt(0));
const u16 = (value: number): number[] => [(value >>> 8) & 255, value & 255];
const u32 = (value: number): number[] => [...u16(value >>> 16), ...u16(value & 0xffff)];
const zeros = (length: number): number[] => new Array<number>(length).fill(0);

/** ISO 基础媒体文件格式的一个盒：长度、类型、内容。 */
const box = (type: string, payload: readonly number[] = []): number[] => [
  ...u32(8 + payload.length),
  ...ascii(type),
  ...payload
];

const ftyp = (major: string, compatible: readonly string[]): number[] =>
  box('ftyp', [...ascii(major), ...u32(0x200), ...compatible.flatMap(ascii)]);

/** MPEG-1 Layer III、128 kbps、44.1 kHz 单声道的静音帧：帧头之后全是 0，每帧 417 字节。 */
const silentMp3Frame = (): number[] => [0xff, 0xfb, 0x90, 0xc4, ...zeros(413)];

const BUILDERS: Readonly<Record<StubFormat, () => number[]>> = {
  mp4: () => [...ftyp('isom', ['isom', 'iso2', 'avc1', 'mp41']), ...box('free'), ...box('mdat')],
  mov: () => [...ftyp('qt  ', ['qt  ']), ...box('free'), ...box('mdat')],
  heic: () => [...ftyp('heic', ['mif1', 'heic']), ...box('free')],
  mp3: () => [...ascii('ID3'), 3, 0, 0, ...zeros(4), ...Array.from({ length: 77 }, silentMp3Frame).flat()],
  xip: () => [...ascii('xar!'), ...u16(28), ...u16(1), ...zeros(16), ...u32(1)],
  dmg: () => [...zeros(512), ...ascii('koly'), ...u32(4), ...u32(512), ...zeros(500)],
  zip: () => [0x50, 0x4b, 0x05, 0x06, ...zeros(18)],
  ttf: () => [0, 1, 0, 0, ...zeros(8)]
};

export const stubFile = (format: StubFormat): Uint8Array => Uint8Array.from(BUILDERS[format]());

export function isEqualUint8Array(u8_1: Uint8Array, u8_2: Uint8Array): boolean {
  if (u8_1.length !== u8_2.length) {
    return false;
  }
  return u8_1.every((value, index) => value === u8_2[index]);
}

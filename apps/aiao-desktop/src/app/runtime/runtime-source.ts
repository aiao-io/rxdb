export function restoreRuntimeSource(source: string): string {
  return source.replaceAll('\\`', '`').replaceAll('\\${', '${');
}

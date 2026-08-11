/** Normalizes a persisted file extension without a leading dot. */
export function normalizeFileExtension(extension: string | null | undefined): string | null {
  const normalized = extension?.replace(/^\.+/, '').trim();
  return normalized || null;
}

/** Builds the user-visible and searchable file name. */
export function formatFileName(name: string, extension: string | null | undefined): string {
  const normalized = normalizeFileExtension(extension);
  return normalized ? `${name}.${normalized}` : name;
}

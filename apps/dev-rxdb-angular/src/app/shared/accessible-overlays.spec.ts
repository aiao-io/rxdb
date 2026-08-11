import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const overlayFiles = [
  '../pages/storage/storage.page.html',
  '../pages/opfs/opfs.page.html',
  '../pages/storage/components/storage-file-preview.component.ts',
  '../pages/opfs/components/opfs-file-preview.component.ts'
];
const hiddenInteractiveOverlay =
  /<(?:div|ul)\b(?=[^>]*class="[^"]*\b(?:modal|menu|modal-box)\b)(?=[^>]*aria-hidden="true")[^>]*>/gs;

describe('interactive overlays', () => {
  it.each(overlayFiles)('does not hide modal or menu content in %s', relativePath => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

    expect(source.match(hiddenInteractiveOverlay)).toBeNull();
  });
});

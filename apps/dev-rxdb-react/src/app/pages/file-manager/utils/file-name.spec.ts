import { formatFileName, normalizeFileExtension } from './file-name';

describe('file name formatting', () => {
  it.each([
    ['readme', 'md', 'readme.md'],
    ['readme', '.md', 'readme.md'],
    ['LICENSE', '', 'LICENSE'],
    ['folder', null, 'folder']
  ])('formats %s and %s as %s', (name, extension, expected) => {
    expect(formatFileName(name, extension)).toBe(expected);
  });

  it('normalizes persisted extensions', () => {
    expect(normalizeFileExtension('.tsx')).toBe('tsx');
    expect(normalizeFileExtension('')).toBeNull();
  });
});

import {
  LucideFileArchive as FileArchive,
  LucideFileAudio as FileAudio,
  LucideFileCode as FileCode,
  LucideFile as FileIcon,
  LucideFileImage as FileImage,
  LucideFileText as FileText,
  LucideFileVideo as FileVideo,
  LucideFolder as Folder
} from '@lucide/angular';
import { describe, expect, it } from 'vitest';
import {
  canPreviewFile,
  formatFileSize,
  getCodeLanguage,
  getFileIcon,
  getFileIconColor,
  getFileType,
  getNameFromPath,
  getParentPath,
  isImageFile,
  isTextFile,
  normalizePath,
  OPFSFileEntry
} from './opfs-utils';

function entry(name: string, kind: OPFSFileEntry['kind'] = 'file'): OPFSFileEntry {
  return {
    name,
    kind,
    handle: {} as FileSystemFileHandle,
    path: `/${name}`
  };
}

describe('OPFS utils', () => {
  it.each([
    ['/hello.txt', './hello.txt'],
    ['./hello.txt', './hello.txt'],
    ['hello.txt', 'hello.txt'],
    ['', '']
  ])('normalizes %s to %s', (path, expected) => {
    expect(normalizePath(path)).toBe(expected);
  });

  it.each([
    ['./folder/file.txt', false, './folder/'],
    ['./folder/nested/', true, './folder/'],
    ['file.txt', false, '/'],
    ['./folder/', true, './']
  ])('gets parent path for %s', (path, isDirectory, expected) => {
    expect(getParentPath(path, isDirectory)).toBe(expected);
  });

  it.each([
    ['./folder/file.txt', false, 'file.txt'],
    ['./folder/nested/', true, 'nested'],
    ['file.txt', false, 'file.txt']
  ])('gets name for %s', (path, isDirectory, expected) => {
    expect(getNameFromPath(path, isDirectory)).toBe(expected);
  });

  it.each(['photo.PNG', 'track.mp3', 'movie.webm', 'source.ts', 'notes.md', 'README'])(
    'previews supported file %s',
    name => {
      expect(canPreviewFile(entry(name))).toBe(true);
    }
  );

  it.each(['archive.zip', 'binary.bin'])('does not assume unsupported file %s is previewable', name => {
    expect(canPreviewFile(entry(name))).toBe(false);
  });

  it('does not preview directories', () => {
    expect(canPreviewFile(entry('folder', 'directory'))).toBe(false);
  });

  it('detects text while allowing newline, carriage return and tab', async () => {
    expect(await isTextFile(new File(['hello\nworld\r\t!'], 'notes.txt'))).toBe(true);
  });

  it('rejects other control characters', async () => {
    expect(await isTextFile(new File(['hello\u0000world'], 'binary.bin'))).toBe(false);
  });

  it('returns false when reading the slice fails', async () => {
    const unreadable = {
      slice: () => ({ text: () => Promise.reject(new Error('read failed')) })
    } as unknown as File;

    expect(await isTextFile(unreadable)).toBe(false);
  });

  it.each([
    ['photo.jpg', 'image'],
    ['track.FLAC', 'audio'],
    ['movie.mkv', 'video'],
    ['source.tsx', 'code'],
    ['notes.csv', 'text'],
    ['archive.zip', 'unknown'],
    ['README', 'unknown']
  ] as const)('classifies %s as %s', (name, expected) => {
    expect(getFileType(entry(name))).toBe(expected);
  });

  it.each([
    ['index.ts', 'TypeScript'],
    ['component.tsx', 'TSX'],
    ['script.cjs', 'JavaScript'],
    ['page.htm', 'HTML'],
    ['style.scss', 'SCSS'],
    ['main.pyw', 'Python'],
    ['header.hpp', 'C++'],
    ['schema.yaml', 'YAML'],
    ['query.sql', 'SQL'],
    ['component.vue', 'Vue'],
    ['README', 'JavaScript'],
    ['unknown.xyz', 'JavaScript']
  ])('maps %s to %s', (name, expected) => {
    expect(getCodeLanguage(name)).toBe(expected);
  });

  it('detects images case-insensitively and rejects directories', () => {
    expect(isImageFile(entry('photo.WEBP'))).toBe(true);
    expect(isImageFile(entry('photo.txt'))).toBe(false);
    expect(isImageFile(entry('photo.png', 'directory'))).toBe(false);
  });

  it.each([
    ['folder', 'directory', Folder, 'text-warning'],
    ['photo.png', 'file', FileImage, 'text-purple-500'],
    ['movie.mp4', 'file', FileVideo, 'text-pink-500'],
    ['track.wav', 'file', FileAudio, 'text-cyan-500'],
    ['archive.tar', 'file', FileArchive, 'text-orange-500'],
    ['source.rs', 'file', FileCode, 'text-blue-500'],
    ['notes.log', 'file', FileText, 'text-green-500'],
    ['binary.bin', 'file', FileIcon, 'text-base-content/60']
  ] as const)('selects icon and color for %s', (name, kind, icon, color) => {
    const fileEntry = entry(name, kind);
    expect(getFileIcon(fileEntry)).toBe(icon);
    expect(getFileIconColor(fileEntry)).toBe(color);
  });

  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [1024 ** 2, '1 MB'],
    [2.25 * 1024 ** 3, '2.25 GB']
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

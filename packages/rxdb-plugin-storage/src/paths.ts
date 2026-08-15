/**
 * @fileoverview storage 路径规范化与校验
 *
 * @remarks
 * 这些函数是纯函数，且同时被服务层与各个 {@link StorageFilesystem} 后端使用。
 * 单独成模块是为了让模块图保持无环：后端实现需要校验路径，但不该反向依赖服务实现。
 *
 * 为兼容既有导入路径，{@link RxdbFileStorage} 所在模块会原样再导出这里的公开函数。
 *
 * @module rxdb-plugin-storage/paths
 */

import { StorageInvalidPathError } from './errors.js';

/**
 * 拆分并逐段校验 storage 路径。
 *
 * @throws {@link StorageInvalidPathError} 路径含反斜杠、NUL、空段、`.`、`..` 或首尾空白时抛出。
 */
const validateStoragePathSegments = (path: string): string[] => {
  if (path.includes('\\') || path.includes('\0')) {
    throw new StorageInvalidPathError(path);
  }

  const rawSegments = path.split('/');
  const segments: string[] = [];

  for (const [index, segment] of rawSegments.entries()) {
    const isBoundary = index === 0 || index === rawSegments.length - 1;
    if (segment === '' && isBoundary) {
      continue;
    }
    if (segment === '' || segment !== segment.trim() || segment === '.' || segment === '..') {
      throw new StorageInvalidPathError(path);
    }
    segments.push(segment);
  }

  return segments;
};

/**
 * 校验单个文件或目录名，返回规范化后的名称。
 *
 * @throws {@link StorageInvalidPathError} 名称为空、含 `/` 或含非法字符时抛出。
 */
export const validateStorageName = (name: string): string => {
  const segments = validateStoragePathSegments(name);
  if (segments.length !== 1 || name.includes('/')) {
    throw new StorageInvalidPathError(name);
  }
  return segments[0];
};

/**
 * 把目录路径规范化为以 `/` 开头且不带结尾 `/` 的形式。
 *
 * @throws {@link StorageInvalidPathError} 路径含空段、反斜杠、`.`、`..` 或首尾空白时抛出。
 */
export const normalizeDirectoryPath = (path?: string): string => {
  const source = path ?? '/';
  if (source === '') {
    return '/';
  }
  const segments = validateStoragePathSegments(source);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
};

/**
 * 把 storage 路径规范化为不带开头 `/` 的 OPFS 相对路径。
 *
 * @throws {@link StorageInvalidPathError} 路径包含非法段时抛出。
 */
export const normalizeRelativeOpfsPath = (path: string): string => validateStoragePathSegments(path).join('/');

/** 把 OPFS 相对路径转换成以 `/` 开头的 storage 绝对路径。 */
export const toAbsoluteStoragePath = (path?: string): string => {
  const normalized = normalizeRelativeOpfsPath(path ?? '');
  return normalized ? `/${normalized}` : '/';
};

/** 返回 OPFS 相对路径的最后一个路径段。 */
export const getFileNameFromOpfsPath = (opfsPath: string): string => {
  const normalized = normalizeRelativeOpfsPath(opfsPath);
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex === -1 ? normalized : normalized.slice(lastSlashIndex + 1);
};

/** 返回 OPFS 相对路径所在的 storage 绝对目录。 */
export const getDirectoryPathFromOpfsPath = (opfsPath: string): string => {
  const normalized = normalizeRelativeOpfsPath(opfsPath);
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex === -1 ? '/' : `/${normalized.slice(0, lastSlashIndex)}`;
};

/**
 * 连接 storage 目录和文件名，返回 OPFS 相对路径。
 *
 * @throws {@link StorageInvalidPathError} 目录或文件名非法时抛出。
 */
export const joinDirectoryAndFileName = (directoryPath: string | undefined, fileName: string): string => {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  const normalizedFileName = validateStorageName(fileName);

  return normalizedDirectoryPath === '/' ? normalizedFileName : (
      `${normalizedDirectoryPath.slice(1)}/${normalizedFileName}`
    );
};

/**
 * 连接父目录和子目录名，返回 storage 绝对路径。
 *
 * @throws {@link StorageInvalidPathError} 任一路径段非法时抛出。
 */
export const joinDirectoryPath = (directoryPath: string | undefined, directoryName: string): string => {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  const normalizedDirectoryName = validateStorageName(directoryName);

  return normalizedDirectoryPath === '/' ?
      `/${normalizedDirectoryName}`
    : `${normalizedDirectoryPath}/${normalizedDirectoryName}`;
};

/** 判断文件是否直属于指定目录。 */
export const isOpfsPathInDirectory = (opfsPath: string, directoryPath?: string): boolean =>
  getDirectoryPathFromOpfsPath(opfsPath) === normalizeDirectoryPath(directoryPath);

/** 判断文件是否位于指定目录或其任意子目录中。 */
export const isOpfsPathInsideDirectory = (opfsPath: string, directoryPath?: string): boolean => {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  if (normalizedDirectoryPath === '/') return true;

  const normalizedOpfsPath = normalizeRelativeOpfsPath(opfsPath);
  const normalizedDirectoryPrefix = `${normalizedDirectoryPath.slice(1)}/`;

  return (
    normalizedOpfsPath === normalizedDirectoryPath.slice(1) || normalizedOpfsPath.startsWith(normalizedDirectoryPrefix)
  );
};

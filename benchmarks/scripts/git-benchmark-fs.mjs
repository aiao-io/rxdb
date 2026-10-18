const EMSCRIPTEN_ERRNO = {
  2: 'EACCES',
  8: 'EBADF',
  10: 'EBUSY',
  20: 'EEXIST',
  22: 'EFBIG',
  28: 'EINVAL',
  29: 'EIO',
  31: 'EISDIR',
  32: 'ELOOP',
  37: 'ENAMETOOLONG',
  44: 'ENOENT',
  48: 'ENOMEM',
  51: 'ENOSPC',
  52: 'ENOSYS',
  54: 'ENOTDIR',
  55: 'ENOTEMPTY',
  58: 'ENOTSUP',
  63: 'EPERM',
  69: 'EROFS',
  75: 'EXDEV'
};

function fail(code, syscall, path, cause) {
  return Object.assign(new Error(`${code}: ${syscall} '${path}'`, { cause }), { code, syscall, path });
}

function normalizePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) throw fail('EINVAL', 'path', path);
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part !== '..') {
      parts.push(part);
      continue;
    }
    if (!parts.length) throw fail('EACCES', 'path', path);
    parts.pop();
  }
  return `/${parts.join('/')}`;
}

function encoding(options) {
  const value = typeof options === 'string' ? options : options?.encoding;
  if (value == null || value === 'buffer') return undefined;
  if (value === 'utf8' || value === 'utf-8') return 'utf8';
  throw fail('EINVAL', 'encoding', value);
}

function bytes(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw fail('EINVAL', 'writeFile', 'data');
}

function fileStats({ mode, size, mtimeMs, ctimeMs = mtimeMs, ...rest }) {
  return {
    dev: 0,
    ino: 0,
    uid: 0,
    gid: 0,
    nlink: 1,
    ...rest,
    mode,
    size,
    mtimeMs,
    ctimeMs,
    mtime: new Date(mtimeMs),
    ctime: new Date(ctimeMs),
    isFile: () => (mode & 0o170000) === 0o100000,
    isDirectory: () => (mode & 0o170000) === 0o040000,
    isSymbolicLink: () => (mode & 0o170000) === 0o120000
  };
}

function assertNonrecursive(options, path) {
  if (options?.recursive) throw fail('ENOTSUP', 'mkdir', path);
}

function emscriptenTimestampMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value * 1_000;
  throw fail('EINVAL', 'stat', 'timestamp');
}

export function createEmscriptenFs(FS) {
  const invoke = async (method, path, ...args) => {
    const normalized = normalizePath(path);
    if (typeof FS[method] !== 'function') throw fail('ENOTSUP', method, normalized);
    try {
      return FS[method](normalized, ...args);
    } catch (error) {
      throw fail(error.code || EMSCRIPTEN_ERRNO[error.errno] || 'EIO', method, normalized, error);
    }
  };
  const stat = async (method, path) => {
    const result = await invoke(method, path);
    return fileStats({
      ...result,
      mtimeMs: result.mtimeMs ?? emscriptenTimestampMs(result.mtime),
      ctimeMs: result.ctimeMs ?? emscriptenTimestampMs(result.ctime)
    });
  };
  const unsupported = method => async path => {
    throw fail('ENOTSUP', method, normalizePath(path));
  };
  return {
    promises: {
      async readFile(path, options) {
        const format = encoding(options);
        const data = await invoke('readFile', path, { encoding: 'binary' });
        return format ? new TextDecoder().decode(data) : data;
      },
      async writeFile(path, data, options) {
        encoding(options);
        const settings = typeof options === 'object' && options !== null ? options : {};
        return invoke('writeFile', path, bytes(data), settings);
      },
      unlink: path => invoke('unlink', path),
      async readdir(path) {
        return (await invoke('readdir', path)).filter(name => name !== '.' && name !== '..');
      },
      async mkdir(path, options) {
        assertNonrecursive(options, path);
        const mode = typeof options === 'number' ? options : options?.mode;
        return mode === undefined ? invoke('mkdir', path) : invoke('mkdir', path, mode);
      },
      rmdir: path => invoke('rmdir', path),
      stat: path => stat('stat', path),
      lstat: path => stat('lstat', path),
      readlink: unsupported('readlink'),
      symlink: async (_target, path) => unsupported('symlink')(path),
      chmod: (path, mode) => invoke('chmod', path, mode)
    }
  };
}

function translateDomError(error, syscall, path) {
  if (error.code && typeof error.code === 'string') return error;
  const codes = {
    NotFoundError: 'ENOENT',
    TypeMismatchError: 'ENOTDIR',
    InvalidModificationError: 'ENOTEMPTY',
    NotAllowedError: 'EACCES',
    NoModificationAllowedError: 'EACCES',
    SecurityError: 'EACCES',
    QuotaExceededError: 'ENOSPC',
    NotSupportedError: 'ENOTSUP'
  };
  return fail(codes[error.name] || 'EIO', syscall, path, error);
}

export async function createOpfsFs(rootHandle) {
  if (rootHandle?.kind !== 'directory') throw fail('ENOTDIR', 'mount', '/');

  const directory = async parts => {
    let handle = rootHandle;
    for (const part of parts) handle = await handle.getDirectoryHandle(part);
    return handle;
  };
  const parent = async path => {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    return { handle: await directory(parts), name };
  };
  const entry = async path => {
    if (path === '/') return rootHandle;
    const { handle, name } = await parent(path);
    try {
      return await handle.getFileHandle(name);
    } catch (error) {
      if (error.name !== 'TypeMismatchError') throw error;
      return handle.getDirectoryHandle(name);
    }
  };
  const operation =
    (syscall, action) =>
    async (path, ...args) => {
      const normalized = normalizePath(path);
      try {
        return await action(normalized, ...args);
      } catch (error) {
        throw translateDomError(error, syscall, normalized);
      }
    };
  const requireFile = async (path, syscall) => {
    const handle = await entry(path);
    if (handle.kind !== 'file') throw fail('EISDIR', syscall, path);
    return handle;
  };
  const requireDirectory = async (path, syscall) => {
    const handle = await entry(path);
    if (handle.kind !== 'directory') throw fail('ENOTDIR', syscall, path);
    return handle;
  };
  const stat = operation('stat', async path => {
    const handle = await entry(path);
    if (handle.kind === 'directory') return fileStats({ mode: 0o40755, size: 0, mtimeMs: 0 });
    const file = await handle.getFile();
    return fileStats({ mode: 0o100644, size: file.size, mtimeMs: file.lastModified });
  });
  const unsupported = syscall =>
    operation(syscall, async path => {
      throw fail('ENOTSUP', syscall, path);
    });

  return {
    promises: {
      readFile: operation('readFile', async (path, options) => {
        const format = encoding(options);
        const file = await (await requireFile(path, 'readFile')).getFile();
        const data = new Uint8Array(await file.arrayBuffer());
        return format ? new TextDecoder().decode(data) : data;
      }),
      writeFile: operation('writeFile', async (path, data, options) => {
        encoding(options);
        const settings = typeof options === 'object' && options !== null ? options : {};
        if (settings.flag && settings.flag !== 'w') throw fail('ENOTSUP', 'writeFile', path);
        if (settings.mode !== undefined && settings.mode & 0o111) throw fail('ENOTSUP', 'writeFile', path);
        const contents = bytes(data);
        if (path === '/') throw fail('EISDIR', 'writeFile', path);
        const { handle, name } = await parent(path);
        let file;
        try {
          file = await handle.getFileHandle(name, { create: true });
        } catch (error) {
          if (error.name === 'TypeMismatchError') throw fail('EISDIR', 'writeFile', path, error);
          throw error;
        }
        const writable = await file.createWritable();
        try {
          await writable.write(contents);
          await writable.close();
        } catch (error) {
          await writable.abort?.().catch(() => undefined);
          throw error;
        }
      }),
      unlink: operation('unlink', async path => {
        await requireFile(path, 'unlink');
        const { handle, name } = await parent(path);
        await handle.removeEntry(name);
      }),
      readdir: operation('readdir', async path => {
        const handle = await requireDirectory(path, 'readdir');
        const names = [];
        for await (const [name] of handle.entries()) names.push(name);
        return names;
      }),
      mkdir: operation('mkdir', async (path, options) => {
        assertNonrecursive(options, path);
        try {
          await entry(path);
          throw fail('EEXIST', 'mkdir', path);
        } catch (error) {
          if (error.name !== 'NotFoundError') throw error;
        }
        const { handle, name } = await parent(path);
        await handle.getDirectoryHandle(name, { create: true });
      }),
      rmdir: operation('rmdir', async path => {
        await requireDirectory(path, 'rmdir');
        if (path === '/') throw fail('EBUSY', 'rmdir', path);
        const { handle, name } = await parent(path);
        await handle.removeEntry(name);
      }),
      stat,
      lstat: stat,
      readlink: unsupported('readlink'),
      symlink: async (_target, path) => unsupported('symlink')(path),
      chmod: unsupported('chmod')
    }
  };
}

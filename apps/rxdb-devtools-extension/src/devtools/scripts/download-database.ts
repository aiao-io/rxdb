/**
 * 数据库下载函数
 * 在被检查页面的上下文中执行，将 OPFS 中的数据库文件打包下载
 *
 * 注意：此函数会被序列化后在目标页面执行，不能引用外部变量或类型
 */
export async function downloadDatabase(databaseName: string) {
  const MAX_TAR_FILE_SIZE = 8_589_934_591;
  const databaseFiles = new Set([
    `${databaseName}.sqlite`,
    `${databaseName}.sqlite-wal`,
    `${databaseName}.sqlite-shm`,
    `${databaseName}.sqlite-journal`
  ]);
  // P0-2：只记 File 句柄，**不读内容**。
  // 原实现是 `{ path, data: ArrayBuffer }` —— 每个文件都 `await file.arrayBuffer()`，
  // 全部读完再整体拷贝一遍打包，峰值内存 ≈ 数据总量 × 2 + Blob。
  // 同源 OPFS 有多大这里就要吃多少，而这个函数是在被检查页面里跑的。
  const files: { path: string; file: Blob }[] = [];

  // 将路径拆分为 ustar 的 name(≤100)/prefix(≤155)，避免 >100 字节被静默截断
  function toUstarPath(path: string): { name: string; prefix: string } {
    const encoder = new TextEncoder();
    if (encoder.encode(path).length <= 100) {
      return { name: path, prefix: '' };
    }
    // 在能让后缀 ≤100 字节的最靠前的 '/' 处切分（前缀最短、name 最长）
    let splitAt = -1;
    for (let i = 0; i < path.length; i++) {
      if (path[i] !== '/') continue;
      if (encoder.encode(path.slice(i + 1)).length <= 100) {
        splitAt = i;
        break;
      }
    }
    if (splitAt === -1 || encoder.encode(path.slice(0, splitAt)).length > 155) {
      throw new Error(`路径过长，无法归档: ${path}`);
    }
    return { name: path.slice(splitAt + 1), prefix: path.slice(0, splitAt) };
  }

  // 递归读取 OPFS 目录
  async function readDirectory(dirHandle: FileSystemDirectoryHandle, path = ''): Promise<void> {
    const entries = dirHandle.entries() as AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
    for await (const [name, handle] of entries) {
      const fullPath = path ? `${path}/${name}` : name;
      if (handle.kind === 'directory') {
        await readDirectory(handle as FileSystemDirectoryHandle, fullPath);
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (file.size > MAX_TAR_FILE_SIZE) {
          throw new Error(`文件过大，无法归档: ${fullPath}`);
        }
        const separator = fullPath.lastIndexOf('/');
        const fileName = separator === -1 ? fullPath : fullPath.slice(separator + 1);
        if (databaseFiles.has(fileName)) {
          files.push({ path: fullPath, file });
        }
      }
    }
  }

  try {
    const root = await navigator.storage.getDirectory();
    await readDirectory(root);

    if (files.length === 0) {
      return { success: false, error: `OPFS 中找不到数据库 ${databaseName} 的文件` };
    }

    // 创建简单的 tar 格式（无压缩，兼容性好）。
    // P0-2：parts 里混放 Uint8Array（头/填充）与 Blob（文件本体）——
    // `Blob` 构造函数本来就接受 Blob 作为 part，浏览器会让它继续由磁盘承载，
    // 文件字节根本不进 JS 堆。
    const tarParts: BlobPart[] = [];

    for (const file of files) {
      // TAR header (512 bytes)
      const header = new Uint8Array(512);
      const encoder = new TextEncoder();

      // 文件名 (0-99)，长路径经 ustar prefix 承载
      const { name, prefix } = toUstarPath(file.path);
      header.set(encoder.encode(name).slice(0, 100), 0);

      // 文件模式 (100-107)
      header.set(encoder.encode('0000644\0'), 100);

      // UID (108-115)
      header.set(encoder.encode('0000000\0'), 108);

      // GID (116-123)
      header.set(encoder.encode('0000000\0'), 116);

      // 文件大小 (124-135) - 八进制
      const byteLength = file.file.size;
      if (byteLength > MAX_TAR_FILE_SIZE) {
        throw new Error(`文件过大，无法归档: ${file.path}`);
      }
      const sizeOctal = byteLength.toString(8).padStart(11, '0') + '\0';
      header.set(encoder.encode(sizeOctal), 124);

      // 修改时间 (136-147)
      const mtime =
        Math.floor(Date.now() / 1000)
          .toString(8)
          .padStart(11, '0') + '\0';
      header.set(encoder.encode(mtime), 136);

      // 校验和占位 (148-155)
      header.set(encoder.encode('        '), 148);

      // 类型标志 (156) - '0' 表示普通文件
      header[156] = 48;

      // ustar magic (257-262) + version (263-264)
      header.set(encoder.encode('ustar\0'), 257);
      header.set(encoder.encode('00'), 263);

      // 前缀 (345-499) - 承载 >100 字节的长路径
      if (prefix) {
        header.set(encoder.encode(prefix), 345);
      }

      // 计算校验和
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += header[i];
      }
      const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
      header.set(encoder.encode(checksumStr), 148);

      tarParts.push(header);

      // 文件内容：直接放 Blob，不读进内存
      tarParts.push(file.file);

      // 填充到 512 字节边界
      const padding = 512 - (byteLength % 512);
      if (padding < 512) {
        tarParts.push(new Uint8Array(padding));
      }
    }

    // 结束标记 (两个 512 字节的零块)
    tarParts.push(new Uint8Array(1024));

    // 触发下载。
    // P0-2：原先这里先 `new Uint8Array(totalLength)` 把所有 part **再整体拷贝一遍**，
    // 然后才包 Blob —— 那是第二份全量副本。Blob 直接接受 parts 数组，不需要这一步。
    const blob = new Blob(tarParts, { type: 'application/x-tar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rxdb-backup-${new Date().toISOString().slice(0, 10)}.tar`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, fileCount: files.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** {@link downloadDatabase} 的执行结果 */
export type DownloadDatabaseResult = Awaited<ReturnType<typeof downloadDatabase>>;

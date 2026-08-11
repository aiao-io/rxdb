import { readDirectoryEntries } from './read-directory-entries';

/**
 * 递归展开拖放进来的文件树，把每个文件按相对路径收进 `files`。
 *
 * @param item - 拖放条目（`DataTransferItem.webkitGetAsEntry()` 的结果）
 * @param path - 当前层级的相对路径前缀，根层传 `''`
 * @param files - 收集容器，原地追加
 *
 * @remarks
 * P0-2：这份实现原先在 `opfs.page.ts` 与 `storage.page.ts` 里各有一份拷贝，
 * 而 **storage 那份已经修好、opfs 那份没有**：
 *
 * ```ts
 * // opfs 的旧版：new Promise(resolve => ...)，没有 reject
 * (item as FileSystemFileEntry).file((file: File) => { ...; resolve(); });
 * //                                                 ↑ 没有 error callback
 * ```
 *
 * `file()` 的第二个参数是错误回调。缺了它，读取失败时这个 Promise 既不 resolve 也不 reject，
 * 外层的 `Promise.all` **永久 pending** —— 上传界面停在"处理中"，没有错误、也不会超时。
 * 目录分支的 `.then()` 同样缺 `.catch`，行为一致。
 *
 * 合并成一份共享实现，顺带让它第一次拥有测试：两处都在页面 private 方法里时谁都断言不了。
 */
export function traverseFileTree(item: FileSystemEntry, path: string, files: File[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (item.isFile) {
      (item as FileSystemFileEntry).file(file => {
        // 给文件补上相对路径信息，供下游按目录结构还原
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false
        });
        files.push(file);
        resolve();
      }, reject);
      return;
    }

    if (item.isDirectory) {
      const reader = (item as FileSystemDirectoryEntry).createReader();
      readDirectoryEntries(reader)
        .then(entries => Promise.all(entries.map(entry => traverseFileTree(entry, `${path}${item.name}/`, files))))
        .then(() => resolve())
        .catch(reject);
      return;
    }

    resolve();
  });
}

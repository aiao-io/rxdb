import { readPickedFolderProject } from './folder-import.js';

/** 在嵌入窗口中选择文件夹副本；取消与宿主关闭均释放文件输入。 */
export async function requestFolderProject(host: HTMLElement, signal: AbortSignal) {
  const selection = await new Promise<readonly File[]>((resolve, reject) => {
    if (signal.aborted) return resolve([]);
    const input = host.ownerDocument.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.hidden = true;
    input.dataset['folderCopyInput'] = '';
    const cleanup = () => {
      input.remove();
      signal.removeEventListener('abort', cancel);
    };
    const finish = (files: readonly File[]) => {
      cleanup();
      resolve(files);
    };
    const cancel = () => finish([]);
    input.onchange = () => finish(Array.from(input.files ?? []));
    input.oncancel = cancel;
    signal.addEventListener('abort', cancel, { once: true });
    host.append(input);
    try {
      input.click();
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
  return readPickedFolderProject(selection);
}

import type { Plugin } from 'vite';

const SHEBANG = '#!/usr/bin/env node';
const CLI_ENTRY_SUFFIX = '/src/cli/cli.ts';
const SHEBANG_LINE = /^#![^\r\n]*(?:\r\n|\n)/u;

const stripQueryAndHash = (id: string): string => id.split('?')[0]?.split('#')[0] ?? id;

/**
 * Vite / Rolldown 的 module id 在 Windows 上可能是正斜杠、反斜杠，
 * 或带 `?v=` 的 query。用 `path.sep` 拼后缀永远对不上 POSIX id。
 */
export const isCliEntryModuleId = (id: string): boolean =>
  stripQueryAndHash(id).replaceAll('\\', '/').endsWith(CLI_ENTRY_SUFFIX);

/** 剥掉源码第一行 shebang，兼容 CRLF。 */
export const stripCliShebang = (code: string): string | null => {
  if (!code.startsWith('#!')) {
    return null;
  }
  const stripped = code.replace(SHEBANG_LINE, '');
  return stripped === code ? null : stripped;
};

/**
 * 给 CLI 产物补 shebang，并在打包前剥掉源码里的 shebang。
 *
 * 源码 shebang 留在入口里时，Rolldown 会把 `cli.js` 打成只有 shebang 的空壳
 *（Windows CI 实测约 0.02 kB），`node dist/cli.js` 以 0 退出、不生成任何文件。
 */
export const rxdbClientGeneratorCliShebangPlugin = (): Plugin => ({
  name: 'rxdb-client-generator-cli-shebang',
  enforce: 'pre',
  transform(code, id) {
    if (!isCliEntryModuleId(id)) {
      return null;
    }

    const stripped = stripCliShebang(code);
    if (stripped === null) {
      return null;
    }

    return {
      code: stripped,
      map: null
    };
  },
  renderChunk(code, chunk) {
    if (chunk.fileName !== 'cli.js') {
      return null;
    }

    return {
      code: code.startsWith(SHEBANG) ? code : `${SHEBANG}\n${code}`,
      map: null
    };
  }
});

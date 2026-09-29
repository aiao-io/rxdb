/**
 * 桌面 PGlite 协议里的两份常量与源头保持一致（US-217 阶段 C）。
 *
 * @remarks
 * `@aiao/rxdb-adapter-sqlite-core` 不依赖核心归档与浏览器 PGlite 适配器，只能各抄一份；本包同时依赖三方，
 * 在这里钉住。块上限跟着归档的 DATA 帧走，一帧对应一条 IPC 消息，两端都不为拼接或二次切分预留缓冲
 * （AC#9、AC#21）；排除清单跟着浏览器侧走，两端对哪些运行态文件不进归档的判断一致。
 */
import { RXDB_BACKUP_CHUNK_SIZE } from '@aiao/rxdb';
import { PGLITE_EXCLUDED_FILES } from '@aiao/rxdb-adapter-pglite';
import {
  DESKTOP_PGLITE_EXCLUDED_FILES,
  DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { describe, expect, it } from 'vitest';

describe('desktop PGlite protocol constants', () => {
  it('caps a data chunk at the archive DATA frame size', () => {
    expect(DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES).toBe(RXDB_BACKUP_CHUNK_SIZE);
  });

  it('excludes the same run-time files as the browser PGlite adapter', () => {
    expect([...DESKTOP_PGLITE_EXCLUDED_FILES].sort()).toEqual([...PGLITE_EXCLUDED_FILES].sort());
  });
});

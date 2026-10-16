import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { PGLITE_WORKER_BTREE_GIST_OPTION, pgliteServerExtensions } from './pglite-server-extensions.js';

void worker({
  init: async options => {
    // 适配器负责的服务端扩展以标记字段带过来（主线程侧装不上），这里装进 worker 内的 PGlite
    const { [PGLITE_WORKER_BTREE_GIST_OPTION]: btreeGist, ...pgliteOptions } = options as PGliteOptions & {
      [PGLITE_WORKER_BTREE_GIST_OPTION]?: boolean;
    };
    return new PGlite({
      ...pgliteOptions,
      extensions: { ...pgliteOptions.extensions, ...pgliteServerExtensions({ btreeGist: btreeGist === true }) }
    });
  }
});

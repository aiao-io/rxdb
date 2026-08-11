import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';

void worker({
  init: async options => new PGlite(options)
});

import sourceConfig from '/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/vite.config.mts';
import { mergeConfig } from 'vite';

export default mergeConfig(sourceConfig({ command: 'serve', mode: 'test' }), {
  root: '/Users/jimmy/Documents/aiao/rxdb',
  cacheDir: '/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/init-ref-probe/cache',
  resolve: {
    alias: { '@aiao/rxdb-plugin-replay': '/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay/src/index.ts' }
  },
  test: {
    include: ['requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/init-ref-probe/init-ref.spec.ts'],
    watch: false,
    reporters: ['default', 'junit'],
    outputFile: { junit: '/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/init-ref-probe/junit.xml' },
    coverage: { enabled: false, reportsDirectory: '/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-plugin-replay-vue/init-ref-probe/coverage' }
  }
});

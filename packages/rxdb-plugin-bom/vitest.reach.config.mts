import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vite.config.mjs';

export default defineConfig(env => {
  const configuration = mergeConfig(baseConfig(env), {
    cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-bom-reach',
    test: {
      name: 'rxdb-plugin-bom-reach',
      coverage: { enabled: false },
      outputFile: { junit: '../../coverage/packages/rxdb-plugin-bom/reach-junit.xml' }
    }
  });
  return { ...configuration, test: { ...configuration.test, include: ['tests-reach/**/*.spec.ts'] } };
});

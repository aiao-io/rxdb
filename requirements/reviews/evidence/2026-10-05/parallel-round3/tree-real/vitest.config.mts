import { defineConfig } from 'vitest/config';
export default defineConfig({root: import.meta.dirname, test: {environment: 'happy-dom', include: ['tree-real.spec.mts'], watch: false, fileParallelism: false, maxWorkers: 1, testTimeout: 20000, reporters: ['default', 'junit'], outputFile: {junit: './tree-real.junit.xml'}}});

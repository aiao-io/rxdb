import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  files?: string[];
};

describe('package manifest', () => {
  it('publishes built runtime and declarations without TypeScript build metadata', () => {
    expect(packageJson.files).toEqual([
      'dist',
      'src',
      '!src/**/*.spec.*',
      '!src/**/*.test.*',
      '!src/**/__tests__/**',
      '!**/*.tsbuildinfo'
    ]);
  });
});

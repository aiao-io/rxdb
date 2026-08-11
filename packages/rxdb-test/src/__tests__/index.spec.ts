import { readFileSync } from 'node:fs';

interface PackageJsonContract {
  version: string;
  exports: Record<string, unknown>;
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJsonContract;

describe('@aiao/rxdb-test public contract', () => {
  it('keeps the runtime version aligned with package.json', async () => {
    const publicApi = await import('../index.js');
    expect(publicApi.version).toBe(packageJson.version);
  });

  it('loads the root source entrypoint', async () => {
    const publicApi = await import('../index.js');
    expect(publicApi.generateTestDbName).toBeTypeOf('function');
    expect(publicApi.expectObservableSequence).toBeTypeOf('function');
    expect(publicApi.makeSearchParityArticles).toBeTypeOf('function');
  });

  it('loads the encrypted source entrypoint', async () => {
    const encryptedApi = await import('../encrypted/index.js');
    expect(encryptedApi.EncryptedUser).toBeTypeOf('function');
    expect(encryptedApi.runCrudSuite).toBeTypeOf('function');
    expect(encryptedApi.runLifecycleSuite).toBeTypeOf('function');
    expect(encryptedApi.runTamperSuite).toBeTypeOf('function');
  });

  it('loads the transaction source entrypoint', async () => {
    const transactionApi = await import('../transaction/index.js');
    expect(transactionApi.runReadinessSuite).toBeTypeOf('function');
    expect(transactionApi.runTransactionIsolationSuite).toBeTypeOf('function');
    expect(transactionApi.runBootstrapAtomicitySuite).toBeTypeOf('function');
    expect(transactionApi.TransactionContractNote).toBeTypeOf('function');
  });

  it('loads the tree-unique source entrypoint', async () => {
    const treeUniqueApi = await import('../tree-unique/index.js');
    expect(treeUniqueApi.runTreeSiblingUniqueSuite).toBeTypeOf('function');
    expect(treeUniqueApi.TreeFile).toBeTypeOf('function');
    expect(treeUniqueApi.TreeMenu).toBeTypeOf('function');
  });

  it('publishes only the declared runtime subpaths', () => {
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './encrypted',
      './entities',
      './package.json',
      './shop',
      './transaction',
      './tree-unique'
    ]);
    expect(packageJson.exports).not.toHaveProperty('./cross-framework-fixtures/*');
    expect(packageJson.exports).not.toHaveProperty('./graph');
    expect(packageJson.exports).not.toHaveProperty('./system');
  });
});

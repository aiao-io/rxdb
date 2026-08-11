import type { Plugin } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';
import type { RxDBClientCLIentGeneratorOptions } from '../../cli/cli.interface.js';
import { rxdbClientGeneratorVitePlugin } from '../../plugins/vite.js';

vi.mock('../../cli/build-client-lib.js', () => ({
  default: vi.fn()
}));

const runBuildStart = async (plugin: Plugin): Promise<void> => {
  const buildStart = plugin.buildStart;
  if (typeof buildStart !== 'function') {
    throw new Error('Expected buildStart to be a function hook');
  }
  await (buildStart as () => void | Promise<void>)();
};

describe('rxdbClientGeneratorVitePlugin', () => {
  const buildClientLibraryMock = vi.mocked(buildClientLibrary);
  const first: RxDBClientCLIentGeneratorOptions = {
    entities: ['./entities/*.ts'],
    outDir: './generated/first'
  };
  const second: RxDBClientCLIentGeneratorOptions = {
    entities: ['./other/*.ts'],
    outDir: './generated/second'
  };

  beforeEach(() => {
    buildClientLibraryMock.mockReset();
  });

  it('accepts one generator config', async () => {
    await runBuildStart(rxdbClientGeneratorVitePlugin(first));

    expect(buildClientLibraryMock).toHaveBeenCalledTimes(1);
    expect(buildClientLibraryMock).toHaveBeenCalledWith(first);
  });

  it('keeps array input support', async () => {
    await runBuildStart(rxdbClientGeneratorVitePlugin([first, second]));

    expect(buildClientLibraryMock).toHaveBeenCalledTimes(2);
    expect(buildClientLibraryMock).toHaveBeenNthCalledWith(1, first);
    expect(buildClientLibraryMock).toHaveBeenNthCalledWith(2, second);
  });

  it('does not defer generation to closeBundle', () => {
    expect(rxdbClientGeneratorVitePlugin(first).closeBundle).toBeUndefined();
  });

  it('rejects configs that share an output directory', () => {
    expect(() => rxdbClientGeneratorVitePlugin([first, { ...second, outDir: first.outDir }])).toThrow(/same outDir/);
  });
});

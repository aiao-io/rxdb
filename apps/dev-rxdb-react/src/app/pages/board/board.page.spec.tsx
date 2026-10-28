import { act, cleanup, render, waitFor } from '@testing-library/react';
import { of } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import BoardPage from './board.page';

const state = vi.hoisted(() => ({
  callback: undefined as (() => void | Promise<void>) | undefined,
  db: {
    use: vi.fn(),
    adapter: vi.fn(),
    connect: vi.fn(async () => undefined),
    disconnectAll: vi.fn(async () => undefined),
    config: { dbName: 'board-test' },
    localAdapter$: null as unknown
  }
}));
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  RxDB: vi.fn(function () {
    return state.db;
  })
}));
vi.mock('@aiao/rxdb-adapter-sqlite-wasm', () => ({ RxDBAdapterSqlite: vi.fn() }));
vi.mock('@aiao/rxdb-test', () => ({ getE2eDbName: () => 'board-test' }));
vi.mock('@aiao/rxdb-plugin-board-react', () => ({
  BoardView: ({ onExportBackup }: { onExportBackup: () => void | Promise<void> }) => {
    state.callback = onExportBackup;
    return null;
  }
}));

afterEach(() => {
  cleanup();
  state.callback = undefined;
  vi.clearAllMocks();
});

it('宿主返回未完成备份的Promise并透传归档失败', async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  state.db.localAdapter$ = of({ backup: () => pending });
  render(<BoardPage />);
  await waitFor(() => expect(state.callback).toBeTypeOf('function'));
  const result = state.callback!();
  expect(result).toBeInstanceOf(Promise);
  const failure = expect(result).rejects.toThrow('归档读取失败');
  await act(async () => {
    reject(new Error('归档读取失败'));
    await failure;
  });
});

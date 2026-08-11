/// <reference lib="webworker" />

import { RXDB_WRITER_PROTOCOL_VERSION, RxDBChange, RxDBMigration, type RxDB } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

interface InitializeMessage {
  type: 'initialize';
  databaseId: string;
  dataDir: string;
}

interface CommandMessage {
  type: 'write' | 'close';
}

type WriterCommand = InitializeMessage | CommandMessage;

interface WriterResponse {
  type: 'ready' | 'written' | 'fenced' | 'closed' | 'error';
  message?: string;
}

let adapter: RxDBAdapterPGlite | undefined;

const send = (response: WriterResponse): void => self.postMessage(response);

const createRxdb = (databaseId: string): RxDB =>
  ({
    config: { dbName: databaseId, entities: [RxDBChange, RxDBMigration] },
    context: {},
    connect: async () => undefined,
    dispatchEvent: () => undefined,
    schemaManager: { getEntityMetadata: () => undefined, getEntityTypeByTableName: () => undefined },
    versionManager: { getCurrentBranch: async () => ({ id: 'main' }) }
  }) as unknown as RxDB;

const handleCommand = async (command: WriterCommand): Promise<void> => {
  if (command.type === 'initialize') {
    adapter = new RxDBAdapterPGlite(createRxdb(command.databaseId), { dataDir: command.dataDir });
    await adapter.connect();
    await adapter.startWriterLease();
    send({ type: 'ready' });
    return;
  }
  if (!adapter) throw new Error('PGlite writer is not initialized.');
  if (command.type === 'write') {
    try {
      await adapter.transaction(async () => undefined, false);
      send({ type: 'written' });
    } catch (error) {
      send({ type: 'fenced', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  await adapter.disconnect();
  adapter = undefined;
  send({ type: 'closed' });
  self.close();
};

self.addEventListener('message', event => {
  void handleCommand(event.data as WriterCommand).catch(error => {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
});

void RXDB_WRITER_PROTOCOL_VERSION;

/// <reference lib="webworker" />

import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

declare let self: SharedWorkerGlobalScope;

const client = new SqliteClient();

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  expose(client, port);
};

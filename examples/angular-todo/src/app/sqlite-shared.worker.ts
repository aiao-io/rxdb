/// <reference lib="webworker" />

import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

declare let self: SharedWorkerGlobalScope;

const client = new WaSqliteClient();

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  expose(client, port);
};

/// <reference lib="webworker" />

import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

const client = new SqliteClient();

expose(client);

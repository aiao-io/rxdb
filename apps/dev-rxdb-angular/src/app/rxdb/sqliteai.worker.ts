/// <reference lib="webworker" />

import { SqliteaiClient } from '@aiao/rxdb-adapter-sqliteai';
import { expose } from 'comlink';

const client = new SqliteaiClient();

expose(client);

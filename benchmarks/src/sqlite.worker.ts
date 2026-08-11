import { SqliteClient } from '@aiao/rxdb-adapter-sqlite';
import { expose } from 'comlink';

const client = new SqliteClient();

expose(client);

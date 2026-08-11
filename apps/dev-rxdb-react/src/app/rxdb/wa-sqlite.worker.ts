import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

const client = new WaSqliteClient();

expose(client);

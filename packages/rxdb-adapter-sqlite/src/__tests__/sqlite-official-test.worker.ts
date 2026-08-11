/// <reference lib="webworker" />

import { expose } from 'comlink';
import { SqliteClient } from '../SqliteOfficialClient.js';

expose(new SqliteClient());

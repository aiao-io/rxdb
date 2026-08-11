/// <reference lib="webworker" />

import { expose } from 'comlink';
import { SqliteaiClient } from '../SqliteaiClient.js';

expose(new SqliteaiClient());

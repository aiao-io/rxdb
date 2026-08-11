import { adapterConstructionSuite } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { waSqliteFactory } from './wa-sqlite-factory.js';

adapterConstructionSuite(waSqliteFactory);

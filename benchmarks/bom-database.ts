import { RxDB, SyncType, type AdapterRepositoryConstructor } from '@aiao/rxdb';
import { PGliteRepository, RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { BOM_ENTITIES, RxDBPluginBom, rxDBPluginBom } from '@aiao/rxdb-plugin-bom';

export const createBomBenchmarkDatabase = async (options: { prefix: string; userId?: string; legacy?: boolean }) => {
  const db = new RxDB({
    dbName: `${options.prefix}-${crypto.randomUUID()}`,
    ...(options.userId === undefined ? {} : { context: { userId: options.userId } }),
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  const legacySystem = options.legacy ? new RxDBPluginBom(db).system : undefined;
  if (!options.legacy) db.use(rxDBPluginBom);
  const adapter = new RxDBAdapterPGlite(db, {
    store: 'memory',
    repositories: { BomRepository: PGliteRepository as unknown as AdapterRepositoryConstructor<RxDBAdapterPGlite> }
  });
  db.adapter('pglite', () => adapter);
  await db.connect('pglite');
  return { db, adapter, legacySystem };
};

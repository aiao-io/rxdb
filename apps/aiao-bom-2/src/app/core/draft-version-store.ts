import type { openDraftDatabase } from './draft-database';
import type { DraftBranch, DraftState } from './types';

type DraftDatabase = Awaited<ReturnType<typeof openDraftDatabase>>;

export class DraftVersionStore {
  private readonly databases = new Map<string, Promise<DraftDatabase>>();
  private pending: Promise<unknown> = Promise.resolve();

  save(branch: DraftBranch, draft: DraftState): Promise<void> {
    return this.run(branch, db => db.save(draft));
  }
  read(branch: DraftBranch, legacy: DraftState): Promise<DraftState> {
    return this.run(branch, async db => {
      const saved = await db.read();
      if (saved) return saved;
      await db.save(legacy);
      return legacy;
    });
  }
  commit(branch: DraftBranch, message: string, operationId: string) {
    return this.run(branch, db => db.commit(message, operationId));
  }
  history(branch: DraftBranch) {
    return this.run(branch, db => db.history());
  }
  restore(branch: DraftBranch, commitId: string): Promise<DraftState> {
    return this.run(branch, db => db.restore(commitId));
  }
  private run<T>(branch: DraftBranch, action: (db: DraftDatabase) => Promise<T>): Promise<T> {
    const result = this.pending.then(async () => {
      let connection = this.databases.get(branch.datasetId);
      if (!connection) {
        connection = import('./draft-database').then(module => module.openDraftDatabase(branch.datasetId));
        this.databases.set(branch.datasetId, connection);
        void connection.catch(() => this.databases.delete(branch.datasetId));
      }
      const db = await connection;
      await db.mount(branch.id, branch.name);
      return action(db);
    });
    this.pending = result.catch(() => undefined);
    return result;
  }
}

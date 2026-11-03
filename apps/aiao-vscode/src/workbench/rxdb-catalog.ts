import { Entity, EntityBase, PropertyType, RxDB, SyncType, type Repository } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import type { WorkbenchCatalog, WorkbenchProjectInfo } from './catalog.js';

/** 项目目录元数据；源码与真实 Git 历史留在独立 OPFS 仓库。 */
@Entity({
  namespace: 'workbench',
  name: 'WorkbenchProject',
  tableName: 'workbench_project',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'template', type: PropertyType.enum, enum: ['vanilla', 'react', 'vue', 'angular'], required: true },
    { name: 'entry', type: PropertyType.string, required: true },
    { name: 'lastOpenedAt', type: PropertyType.number, required: true }
  ]
})
export class WorkbenchProject extends EntityBase<string> {
  name!: string;
  template!: WorkbenchProjectInfo['template'];
  entry!: string;
  lastOpenedAt!: number;
}

/** 每个项目的编辑会话状态（标签与活动文件），用于重开时恢复工作台。 */
@Entity({
  namespace: 'workbench',
  name: 'WorkbenchSessionState',
  tableName: 'workbench_session_state',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'tabs', type: PropertyType.stringArray, required: true },
    { name: 'activePath', type: PropertyType.string, required: false },
    { name: 'commitMessage', type: PropertyType.string, required: false },
    { name: 'lastTouchedAt', type: PropertyType.number, required: true }
  ]
})
export class WorkbenchSessionState extends EntityBase<string> {
  tabs!: string[];
  activePath?: string;
  commitMessage?: string;
  lastTouchedAt!: number;
}

/** 用已注册 WorkbenchProject 的宿主数据库保存项目目录。 */
export function createRxDBWorkbenchCatalog(db: RxDB): WorkbenchCatalog {
  const repository = db.entityManager.getRepository<typeof WorkbenchProject, Repository<typeof WorkbenchProject>>(
    WorkbenchProject
  );
  const stateRepository = db.entityManager.getRepository<
    typeof WorkbenchSessionState,
    Repository<typeof WorkbenchSessionState>
  >(WorkbenchSessionState);
  const findState = (projectId: string) =>
    firstValueFrom(
      stateRepository.findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: projectId }] }
      })
    );
  return {
    async list() {
      const records = await firstValueFrom(repository.findAll({ where: { combinator: 'and', rules: [] } }));
      return records.map(record => ({
        id: record.id,
        name: record.name,
        template: record.template,
        entry: record.entry,
        updatedAt: record.lastOpenedAt
      }));
    },
    async put(project) {
      const existing = await firstValueFrom(
        repository.findOne({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: project.id }] } })
      );
      const record = existing ?? db.entityManager.instantiate(WorkbenchProject, { id: project.id });
      record.name = project.name;
      record.template = project.template;
      record.entry = project.entry;
      record.lastOpenedAt = project.updatedAt;
      await record.save();
    },
    async getState(projectId) {
      const existing = await findState(projectId);
      if (!existing) return null;
      return {
        tabs: [...existing.tabs],
        activePath: existing.activePath ?? null,
        commitMessage: existing.commitMessage
      };
    },
    async putState(projectId, state) {
      const existing = await findState(projectId);
      const record = existing ?? db.entityManager.instantiate(WorkbenchSessionState, { id: projectId });
      record.tabs = [...state.tabs];
      record.activePath = state.activePath ?? undefined;
      record.commitMessage = state.commitMessage;
      record.lastTouchedAt = Date.now();
      await record.save();
    }
  };
}

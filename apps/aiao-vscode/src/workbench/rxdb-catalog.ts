import { Entity, EntityBase, PropertyType, RxDB, SyncType, type Repository } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { githubProjectInfo, type WorkbenchCatalog, type WorkbenchProjectInfo } from './catalog.js';
import { parseWorkbenchPreferences, parseWorkbenchProjectState } from './workbench-state.js';

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
    { name: 'activePath', type: PropertyType.string, required: false, nullable: true },
    { name: 'commitMessage', type: PropertyType.string, required: false, nullable: true },
    { name: 'lastTouchedAt', type: PropertyType.number, required: true }
  ]
})
export class WorkbenchSessionState extends EntityBase<string> {
  tabs!: string[];
  activePath?: string;
  commitMessage?: string;
  lastTouchedAt!: number;
}

/** 每个项目的工作台布局（Dockview 序列化结果）；独立表，不迁移既有 workbench_session_state 的 schema。 */
@Entity({
  namespace: 'workbench',
  name: 'WorkbenchLayoutState',
  tableName: 'workbench_layout_state',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'layout', type: PropertyType.json, required: true },
    { name: 'lastTouchedAt', type: PropertyType.number, required: true }
  ]
})
export class WorkbenchLayoutState extends EntityBase<string> {
  layout!: unknown;
  lastTouchedAt!: number;
}

/** GitHub 远程仓库的目录条目；独立表，不迁移既有 workbench_project 的 schema。 */
@Entity({
  namespace: 'workbench',
  name: 'WorkbenchRemoteProject',
  tableName: 'workbench_remote_project',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'remoteOwner', type: PropertyType.string, required: true },
    { name: 'remoteRepo', type: PropertyType.string, required: true },
    { name: 'remoteBranch', type: PropertyType.string, required: true },
    { name: 'lastOpenedAt', type: PropertyType.number, required: true }
  ]
})
export class WorkbenchRemoteProject extends EntityBase<string> {
  name!: string;
  remoteOwner!: string;
  remoteRepo!: string;
  remoteBranch!: string;
  lastOpenedAt!: number;
}

/** 完整编辑会话与用户偏好，独立表保留既有数据库结构。 */
@Entity({
  namespace: 'workbench',
  name: 'WorkbenchLocalState',
  tableName: 'workbench_local_state',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'value', type: PropertyType.json, required: true },
    { name: 'lastTouchedAt', type: PropertyType.number, required: true }
  ]
})
export class WorkbenchLocalState extends EntityBase<string> {
  value!: unknown;
  lastTouchedAt!: number;
}

/** 用宿主已注册的工作台实体保存项目目录、恢复草稿与偏好。 */
export function createRxDBWorkbenchCatalog(db: RxDB): WorkbenchCatalog {
  const repository = db.entityManager.getRepository<typeof WorkbenchProject, Repository<typeof WorkbenchProject>>(
    WorkbenchProject
  );
  const remoteRepository = db.entityManager.getRepository<
    typeof WorkbenchRemoteProject,
    Repository<typeof WorkbenchRemoteProject>
  >(WorkbenchRemoteProject);
  const stateRepository = db.entityManager.getRepository<
    typeof WorkbenchSessionState,
    Repository<typeof WorkbenchSessionState>
  >(WorkbenchSessionState);
  const layoutRepository = db.entityManager.getRepository<
    typeof WorkbenchLayoutState,
    Repository<typeof WorkbenchLayoutState>
  >(WorkbenchLayoutState);
  const localRepository = db.entityManager.getRepository<
    typeof WorkbenchLocalState,
    Repository<typeof WorkbenchLocalState>
  >(WorkbenchLocalState);
  const findLocalState = (id: string) =>
    firstValueFrom(
      localRepository.findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
      })
    );
  const putLocalState = async (id: string, value: unknown): Promise<void> => {
    const existing = await findLocalState(id);
    const record = existing ?? db.entityManager.instantiate(WorkbenchLocalState, { id });
    record.value = value;
    record.lastTouchedAt = Date.now();
    await record.save();
  };
  const findState = (projectId: string) =>
    firstValueFrom(
      stateRepository.findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: projectId }] }
      })
    );
  const findLayout = (projectId: string) =>
    firstValueFrom(
      layoutRepository.findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: projectId }] }
      })
    );
  const findRemote = (projectId: string) =>
    firstValueFrom(
      remoteRepository.findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: projectId }] }
      })
    );
  return {
    async list() {
      const [records, remoteRecords] = await Promise.all([
        firstValueFrom(repository.findAll({ where: { combinator: 'and', rules: [] } })),
        firstValueFrom(remoteRepository.findAll({ where: { combinator: 'and', rules: [] } }))
      ]);
      return [
        ...records.map(record => ({
          id: record.id,
          name: record.name,
          template: record.template,
          entry: record.entry,
          updatedAt: record.lastOpenedAt
        })),
        ...remoteRecords.map(record =>
          githubProjectInfo(record.remoteOwner, record.remoteRepo, record.remoteBranch, record.lastOpenedAt)
        )
      ];
    },
    async put(project) {
      if (project.remote) {
        const existing = await findRemote(project.id);
        const record = existing ?? db.entityManager.instantiate(WorkbenchRemoteProject, { id: project.id });
        record.name = project.name;
        record.remoteOwner = project.remote.owner;
        record.remoteRepo = project.remote.repo;
        record.remoteBranch = project.remote.branch;
        record.lastOpenedAt = project.updatedAt;
        await record.save();
        return;
      }
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
      const local = await findLocalState(`project:${projectId}`);
      if (local) return parseWorkbenchProjectState(local.value);
      const existing = await findState(projectId);
      if (!existing) return null;
      return {
        tabs: [...existing.tabs],
        activePath: existing.activePath ?? null,
        commitMessage: existing.commitMessage
      };
    },
    putState: (projectId, state) => putLocalState(`project:${projectId}`, state),
    async getPreferences() {
      const record = await findLocalState('preferences');
      return record ? parseWorkbenchPreferences(record.value) : null;
    },
    putPreferences: preferences => putLocalState('preferences', preferences),
    async getLayout(projectId) {
      return (await findLayout(projectId))?.layout ?? null;
    },
    async putLayout(projectId, layout) {
      const existing = await findLayout(projectId);
      const record = existing ?? db.entityManager.instantiate(WorkbenchLayoutState, { id: projectId });
      record.layout = layout;
      record.lastTouchedAt = Date.now();
      await record.save();
    }
  };
}

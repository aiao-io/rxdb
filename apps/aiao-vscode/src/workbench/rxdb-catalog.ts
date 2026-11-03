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

/** 用已注册 WorkbenchProject 的宿主数据库保存项目目录。 */
export function createRxDBWorkbenchCatalog(db: RxDB): WorkbenchCatalog {
  const repository = db.entityManager.getRepository<typeof WorkbenchProject, Repository<typeof WorkbenchProject>>(
    WorkbenchProject
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
    }
  };
}

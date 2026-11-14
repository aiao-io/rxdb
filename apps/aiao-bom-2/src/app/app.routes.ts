import type { Routes } from '@angular/router';
import type { DomainDraftEnvelope } from './core/domain-export';
import { WorkspaceRepository } from './core/storage';
const repository = new WorkspaceRepository();

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./app').then(m => m.App) },
  {
    path: '',
    loadChildren: () =>
      import('@modules/bom-workspace').then(m =>
        m.domainRoutes({
          databaseName: 'aiao-bom-2-domain-v1',
          overviewPath: '/domain',
          workbenchPath: '/',
          label: 'aiao BOM · 领域工作区',
          readPending: () => repository.read<DomainDraftEnvelope>('domain:pending'),
          completePending: async envelope => {
            await repository.write(`domain:receipt:${envelope.datasetId}:${envelope.revisionNo}`, envelope);
            await repository.delete('domain:pending');
          }
        })
      )
  }
];

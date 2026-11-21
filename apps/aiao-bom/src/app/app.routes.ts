import type { Routes } from '@angular/router';
import type { DomainDraftEnvelope } from './core/domain-export';
import { WorkspaceRepository } from './core/storage';
const repository = new WorkspaceRepository();

export const appRoutes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('@modules/bom-workspace').then(m =>
        m.domainRoutes({
          databaseName: 'aiao-bom-domain-v1',
          overviewPath: '/bom',
          workbenchPath: '/',
          label: 'aiao BOM',
          workbenchRoute: {
            path: '',
            pathMatch: 'full',
            title: 'BOM 工作台',
            loadComponent: () => import('./app').then(m => m.App)
          },
          readPending: () => repository.read<DomainDraftEnvelope>('domain:pending'),
          completePending: async envelope => {
            await repository.write(`domain:receipt:${envelope.datasetId}:${envelope.revisionNo}`, envelope);
            await repository.delete('domain:pending');
          }
        })
      )
  }
];

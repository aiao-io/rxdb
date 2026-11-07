import { provideRxDB } from '@aiao/rxdb-angular';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AiApiService } from './adapters/ai-api.service';
import { AiDrawerService } from './adapters/ai-drawer.service';
import { clientPackageApi } from './adapters/client-package-api';
import { fetchRemoteSqlSchema } from './adapters/remote-schema-api';
import { sqlExecutionApi } from './adapters/sql-execution-api';
import { appRoutes } from './app.routes';
import { createDesignerDatabase } from './database';
import { MODEL_DESIGNER_TRANSLATIONS, ZH_TRANSLATIONS } from './model-designer/i18n';
import {
  AI_API_ADAPTER,
  AI_DRAWER_ADAPTER,
  MODEL_DESIGNER_CONFIG
} from './model-designer/interfaces/designer.interface';
import { CLIENT_PACKAGE_ADAPTER } from './model-designer/services/client-package-adapter';
import { SQL_EXECUTION_ADAPTER } from './model-designer/services/sql-execution-adapter';
import { REMOTE_SCHEMA_SOURCE } from './model-designer/sql/compare-remote';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideRxDB(createDesignerDatabase),
    { provide: MODEL_DESIGNER_CONFIG, useValue: { isDarkMode: signal(false), theme: signal('light') } },
    { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(ZH_TRANSLATIONS) },
    { provide: AI_DRAWER_ADAPTER, useExisting: AiDrawerService },
    { provide: AI_API_ADAPTER, useExisting: AiApiService },
    { provide: CLIENT_PACKAGE_ADAPTER, useValue: clientPackageApi },
    { provide: REMOTE_SCHEMA_SOURCE, useValue: { fetchRemoteSchema: fetchRemoteSqlSchema } },
    { provide: SQL_EXECUTION_ADAPTER, useValue: sqlExecutionApi }
  ]
};

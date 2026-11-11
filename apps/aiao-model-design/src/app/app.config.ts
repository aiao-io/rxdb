import { provideRxDB } from '@aiao/rxdb-angular';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpAgentGateway } from './adapters/agent-gateway';
import { AiDrawerService } from './adapters/ai-drawer.service';
import { appRoutes } from './app.routes';
import { createDesignerDatabase } from './database';
import { MODEL_DESIGNER_TRANSLATIONS, ZH_TRANSLATIONS } from './model-designer/i18n';
import {
  AGENT_GATEWAY,
  AI_DRAWER_ADAPTER,
  MODEL_DESIGNER_CONFIG
} from './model-designer/interfaces/designer.interface';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideRxDB(createDesignerDatabase),
    { provide: MODEL_DESIGNER_CONFIG, useValue: { isDarkMode: signal(false), theme: signal('light') } },
    { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(ZH_TRANSLATIONS) },
    { provide: AI_DRAWER_ADAPTER, useExisting: AiDrawerService },
    { provide: AGENT_GATEWAY, useFactory: () => new HttpAgentGateway() }
  ]
};

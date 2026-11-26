import { connectOrbitClient } from '@aiao/orbit/client';
import { getBenchmarksI18n } from './i18n/runtime';

void connectOrbitClient()
  .then(async client => {
    try {
      const { bootstrap } = await import('./bootstrap');
      await bootstrap(client);
    } catch (error) {
      client?.fail(error instanceof Error ? error.message : getBenchmarksI18n().t('app.startupFailed'));
      throw error;
    }
  })
  .catch(error => console.error(error));

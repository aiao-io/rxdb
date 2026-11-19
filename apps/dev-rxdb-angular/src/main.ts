import { connectOrbitClient } from '@aiao/orbit/client';

void connectOrbitClient()
  .then(async client => {
    try {
      const { bootstrap } = await import('./bootstrap');
      await bootstrap(client);
    } catch (error) {
      client?.fail(error instanceof Error ? error.message : '应用启动失败');
      throw error;
    }
  })
  .catch(error => console.error(error));

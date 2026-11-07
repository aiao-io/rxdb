import { Container, getContainer } from '@cloudflare/containers';
import { containerEnvironment } from './edge/container-env';
import { routeRequest, type EdgeEnvironment } from './edge/router';

interface CloudflareEnvironment extends EdgeEnvironment {
  API: DurableObjectNamespace<ModelDesignApi>;
}

/** 保留 Bun、PostgreSQL 和 npm CLI 的原 API 运行时。 */
export class ModelDesignApi extends Container<CloudflareEnvironment> {
  override defaultPort = 3200;
  override sleepAfter = '10m';
  override envVars = containerEnvironment(this.env);
}

export default {
  fetch(request: Request, env: CloudflareEnvironment): Promise<Response> {
    return routeRequest(request, env, forwarded => getContainer(env.API, 'model-design-api').fetch(forwarded));
  }
} satisfies ExportedHandler<CloudflareEnvironment>;

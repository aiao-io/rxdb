import { routeRequest, type EdgeEnvironment } from './edge/router';

export default {
  fetch(request: Request, env: EdgeEnvironment): Promise<Response> {
    return routeRequest(request, env);
  }
} satisfies ExportedHandler<EdgeEnvironment>;

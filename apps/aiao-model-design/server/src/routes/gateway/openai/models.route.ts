import { Elysia } from 'elysia';
import type { GatewayDeps } from '../index';

interface OpenAiModelObject {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  'x-aiao-modality': string;
  'x-aiao-capabilities': readonly string[];
  'x-aiao-provider': string;
}

export interface ModelsListResponse {
  object: 'list';
  data: OpenAiModelObject[];
}

/**
 * 构造 GET /v1/models 路由（FR-056 / T044）
 *
 * - 响应严格遵循 OpenAI `Model` 对象格式 + `x-aiao-*` 扩展字段
 * - 仅含 ProviderRegistry 中 enabled provider 名下的 model id
 *   （skipped provider 的 model 不进 ModelRegistry，自然不会出现）
 * - owned_by 填真实 provider id 而非 'organization-mock'
 */
export function createModelsRoute(deps: GatewayDeps) {
  return new Elysia().get(
    '/models',
    (): ModelsListResponse => {
      const data: OpenAiModelObject[] = [];
      for (const entry of deps.modelRegistry.byId.values()) {
        data.push({
          id: entry.modelId,
          object: 'model',
          created: entry.registeredAt,
          owned_by: entry.ownedBy,
          'x-aiao-modality': entry.modality,
          'x-aiao-capabilities': entry.capabilities,
          'x-aiao-provider': entry.providerId
        });
      }
      return { object: 'list', data };
    },
    {
      detail: {
        tags: ['Gateway-OpenAI'],
        summary: '已注册模型 discover',
        description:
          '返回 OpenAI Model 对象列表，仅含 enabled provider，含 x-aiao-* 扩展字段（owned_by 填真实 provider id）'
      }
    }
  );
}

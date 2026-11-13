import { createRoute, z } from '@hono/zod-openapi';

const ApiErrorSchema = z.object({ error: z.string().openapi({ example: '请求数据无效。' }) }).openapi('ApiError');

const InstallationAuthSchema = z
  .object({
    url: z.string().url().openapi({ example: 'https://example.supabase.co' }),
    anonKey: z.string().openapi({ example: 'sb_publishable_example' }),
    storageUrl: z.string().url().optional()
  })
  .openapi('InstallationAuth');

const InstallationStatusSchema = z
  .object({
    initialized: z.boolean(),
    managed: z.boolean(),
    bootstrapRequired: z.boolean(),
    auth: InstallationAuthSchema.nullable()
  })
  .openapi('InstallationStatus');

const InstallationInputSchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'admin@example.com' }),
    password: z.string().min(12).max(128).openapi({ example: 'correct horse battery staple' }),
    bootstrapSecret: z.string().min(32),
    supabaseUrl: z.string().url().optional(),
    anonKey: z.string().optional(),
    serviceRoleKey: z.string().optional()
  })
  .openapi('InstallationInput');

const PromptFieldSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    defaultValue: z.string(),
    required: z.boolean()
  })
  .openapi('PromptField');

const PromptNodeSchema = z
  .object({
    type: z.enum(['doc', 'paragraph', 'text', 'hardBreak', 'templateField']),
    text: z.string().optional(),
    attrs: z.object({ fieldId: z.string(), value: z.string().optional() }).optional(),
    content: z.array(z.unknown()).optional()
  })
  .openapi('PromptNode');

const PromptTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/),
    title: z.string(),
    purpose: z.string(),
    style: z.string(),
    tags: z.array(z.string()),
    prompt: z.string(),
    image: z.string(),
    alt: z.string(),
    updatedAt: z.string(),
    author: z.string(),
    source: z.string(),
    rights: z.enum(['aiao-original-text-and-svg', 'community-reference']),
    referenceModel: z.string().nullable(),
    needsReference: z.boolean(),
    featuredRank: z.number().int().nullable(),
    templateDocument: PromptNodeSchema.optional(),
    fields: z.array(PromptFieldSchema).optional()
  })
  .openapi('PromptTemplate');

const PublishedTemplatesSchema = z
  .object({
    templates: z.array(
      z
        .object({
          template: PromptTemplateSchema,
          revision: z.number().int()
        })
        .openapi('PublishedTemplate')
    )
  })
  .openapi('PublishedTemplates');

const ProviderPolicyEntrySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    baseUrl: z.string().url(),
    models: z.array(z.string()),
    sizes: z.array(z.enum(['1024x1024', '1536x1024', '1024x1536'])),
    enabled: z.boolean(),
    direct: z.boolean(),
    proxy: z.boolean()
  })
  .openapi('ProviderPolicyEntry');

const ProviderPolicySchema = z
  .object({ version: z.literal(1), providers: z.array(ProviderPolicyEntrySchema) })
  .openapi('ProviderPolicy');

const ProviderPoliciesSchema = z.object({ policy: ProviderPolicySchema.nullable() }).openapi('ProviderPolicies');

const ProviderProbeCheckSchema = z
  .object({
    target: z.string().url(),
    root: z.record(z.string(), z.unknown()),
    preflight: z.record(z.string(), z.unknown()),
    reachable: z.boolean(),
    browserDirect: z.boolean()
  })
  .openapi('ProviderProbeCheck');

const ProviderProbeSchema = z
  .object({
    checkedAt: z.string(),
    providers: z.array(ProviderProbeCheckSchema),
    interpretation: z.string()
  })
  .openapi('ProviderProbe');

const ImageRelayInputSchema = z
  .object({
    model: z.string().min(1).max(200).openapi({ example: 'image-model' }),
    prompt: z.string().min(1).max(2000).openapi({ example: 'A quiet forest at sunrise' }),
    n: z.literal(1),
    size: z.enum(['1024x1024', '1536x1024', '1024x1536'])
  })
  .openapi('ImageRelayInput');

const RelayHeadersSchema = z
  .object({
    authorization: z.string().openapi({
      param: { name: 'authorization', in: 'header' },
      example: 'Bearer provider-api-key'
    }),
    'x-provider-base': z
      .string()
      .url()
      .openapi({
        param: { name: 'x-provider-base', in: 'header' },
        example: 'https://provider.example.test/v1'
      })
  })
  .openapi('RelayHeaders');

const RelayTaskHeadersSchema = RelayHeadersSchema.extend({
  'x-relay-task-token': z.string().openapi({
    param: { name: 'x-relay-task-token', in: 'header' },
    example: 'relay-task-token'
  })
}).openapi('RelayTaskHeaders');

const TaskIdParamsSchema = z
  .object({
    taskId: z
      .string()
      .uuid()
      .openapi({
        param: { name: 'taskId', in: 'path' },
        example: '00000000-0000-4000-8000-000000000000'
      })
  })
  .openapi('RelayTaskParams');

const RelayResponseSchema = z.record(z.string(), z.unknown()).openapi('RelayResponse');
const RelayBinaryResponseSchema = z.string().openapi({ format: 'binary' });

const CreditSnapshotSchema = z
  .object({
    account: z.object({
      balance: z.number().int().nonnegative(),
      reserved: z.number().int().nonnegative(),
      available: z.number().int().nonnegative()
    }),
    entries: z.array(
      z.object({
        id: z.number().int(),
        user_id: z.string().uuid(),
        actor_id: z.string().uuid(),
        delta: z.number().int(),
        balance_after: z.number().int().nonnegative(),
        reason: z.string(),
        source: z.enum(['admin', 'generation']),
        request_id: z.string().uuid(),
        created_at: z.string()
      })
    )
  })
  .openapi('CreditSnapshot');
const CreditQuerySchema = z.object({
  before: z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .optional()
});
const SessionHeadersSchema = z.object({ authorization: z.string().regex(/^Bearer [A-Za-z0-9._~-]+$/) });

export const apiRoutes = {
  credits: createRoute({
    method: 'get',
    path: '/api/credits',
    tags: ['Credits'],
    request: { headers: SessionHeadersSchema, query: CreditQuerySchema },
    responses: {
      200: {
        description: '本人余额与最近五十条流水',
        content: { 'application/json': { schema: CreditSnapshotSchema } }
      },
      401: { description: '账号未登录', content: { 'application/json': { schema: ApiErrorSchema } } }
    }
  }),
  adminCredits: createRoute({
    method: 'get',
    path: '/api/admin/users/{userId}/credits',
    tags: ['Credits'],
    request: {
      headers: SessionHeadersSchema,
      params: z.object({ userId: z.string().uuid() }),
      query: CreditQuerySchema
    },
    responses: {
      200: {
        description: '管理员查询用户余额与流水',
        content: { 'application/json': { schema: CreditSnapshotSchema } }
      },
      403: { description: '需要有效管理员', content: { 'application/json': { schema: ApiErrorSchema } } }
    }
  }),
  adjustCredits: createRoute({
    method: 'post',
    path: '/api/admin/users/{userId}/credits',
    tags: ['Credits'],
    request: {
      headers: SessionHeadersSchema,
      params: z.object({ userId: z.string().uuid() }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                delta: z
                  .number()
                  .int()
                  .min(-2147483647)
                  .max(2147483647)
                  .refine(value => value !== 0),
                reason: z.string().trim().min(1).max(500),
                requestId: z.string().uuid()
              })
              .strict()
          }
        }
      }
    },
    responses: {
      200: {
        description: '积分调整的不可变回执',
        content: { 'application/json': { schema: z.object({ entry: CreditSnapshotSchema.shape.entries.element }) } }
      },
      400: { description: '调整参数无效', content: { 'application/json': { schema: ApiErrorSchema } } },
      402: { description: '可用积分不足', content: { 'application/json': { schema: ApiErrorSchema } } },
      403: { description: '需要有效管理员与同源请求', content: { 'application/json': { schema: ApiErrorSchema } } },
      409: { description: '操作标识冲突', content: { 'application/json': { schema: ApiErrorSchema } } }
    }
  }),
  installationGet: createRoute({
    method: 'get',
    path: '/api/installation',
    tags: ['Installation'],
    responses: {
      200: {
        description: '当前安装状态',
        content: { 'application/json': { schema: InstallationStatusSchema } }
      },
      503: {
        description: '安装配置不可用',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  installationPost: createRoute({
    method: 'post',
    path: '/api/installation',
    tags: ['Installation'],
    request: {
      body: {
        content: { 'application/json': { schema: InstallationInputSchema } },
        required: true
      }
    },
    responses: {
      200: {
        description: '安装完成',
        content: { 'application/json': { schema: z.object({ initialized: z.literal(true) }) } }
      },
      400: {
        description: '安装参数无效',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      403: {
        description: '安装密钥无效',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      409: {
        description: '安装状态冲突',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  templates: createRoute({
    method: 'get',
    path: '/api/templates',
    tags: ['Content'],
    responses: {
      200: {
        description: '已发布模板',
        content: { 'application/json': { schema: PublishedTemplatesSchema } }
      },
      503: {
        description: '安装配置不可用',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  providerPolicies: createRoute({
    method: 'get',
    path: '/api/provider-policies',
    tags: ['Content'],
    responses: {
      200: {
        description: '已发布的供应商策略',
        content: { 'application/json': { schema: ProviderPoliciesSchema } }
      },
      503: {
        description: '安装配置不可用',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  providerProbe: createRoute({
    method: 'get',
    path: '/api/provider-probe',
    tags: ['Diagnostics'],
    responses: {
      200: {
        description: '供应商连通性检查结果',
        content: { 'application/json': { schema: z.union([ProviderProbeSchema, z.object({ error: z.string() })]) } }
      },
      429: {
        description: '检查请求过于频繁',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      503: {
        description: '安装配置不可用',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  relay: createRoute({
    method: 'post',
    path: '/api/relay',
    tags: ['Relay'],
    request: {
      headers: RelayHeadersSchema,
      body: {
        content: { 'application/json': { schema: ImageRelayInputSchema } },
        required: true
      }
    },
    responses: {
      200: {
        description: '供应商生成结果',
        content: { 'application/json': { schema: RelayResponseSchema } }
      },
      400: {
        description: '请求参数无效',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      403: {
        description: '供应商未启用',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      502: {
        description: '供应商连接失败',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  relayTaskCreate: createRoute({
    method: 'put',
    path: '/api/relay/tasks/{taskId}',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: RelayTaskHeadersSchema,
      body: {
        content: { 'application/json': { schema: ImageRelayInputSchema } },
        required: true
      }
    },
    responses: {
      200: {
        description: '重复提交返回当前任务状态',
        content: { 'application/json': { schema: RelayResponseSchema } }
      },
      202: {
        description: '任务已提交',
        content: { 'application/json': { schema: RelayResponseSchema } }
      },
      400: {
        description: '请求参数无效',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      403: {
        description: '请求来源未授权',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      404: {
        description: '任务不存在',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  relayTaskGet: createRoute({
    method: 'get',
    path: '/api/relay/tasks/{taskId}',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: z.object({ 'x-relay-task-token': RelayTaskHeadersSchema.shape['x-relay-task-token'] }),
      query: z.object({ wait: z.coerce.number().int().min(0).max(25).optional() })
    },
    responses: {
      200: {
        description: '任务状态',
        content: { 'application/json': { schema: RelayResponseSchema } }
      },
      404: {
        description: '任务不存在',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  relayTaskResult: createRoute({
    method: 'get',
    path: '/api/relay/tasks/{taskId}/result',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: z.object({ 'x-relay-task-token': RelayTaskHeadersSchema.shape['x-relay-task-token'] })
    },
    responses: {
      200: {
        description: '任务结果',
        content: { 'application/octet-stream': { schema: RelayBinaryResponseSchema } }
      },
      404: {
        description: '任务不存在',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      409: {
        description: '结果尚未就绪',
        content: { 'application/json': { schema: ApiErrorSchema } }
      },
      410: {
        description: '结果已过期',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  relayTaskAbandon: createRoute({
    method: 'post',
    path: '/api/relay/tasks/{taskId}/abandon',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: z.object({ 'x-relay-task-token': RelayTaskHeadersSchema.shape['x-relay-task-token'] })
    },
    responses: {
      200: {
        description: '任务已放弃',
        content: { 'application/json': { schema: RelayResponseSchema } }
      },
      404: {
        description: '任务不存在',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  }),
  relayTaskDelete: createRoute({
    method: 'delete',
    path: '/api/relay/tasks/{taskId}',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: z.object({ 'x-relay-task-token': RelayTaskHeadersSchema.shape['x-relay-task-token'] })
    },
    responses: {
      204: {
        description: '任务已删除'
      },
      404: {
        description: '任务不存在',
        content: { 'application/json': { schema: ApiErrorSchema } }
      }
    }
  })
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Aiao Media API',
    version: '1.0.0',
    description: 'Aiao Media Worker 的公开 HTTP API。'
  },
  tags: [
    { name: 'Installation', description: '安装与配置' },
    { name: 'Content', description: '公开内容' },
    { name: 'Credits', description: '平台积分与不可变流水' },
    { name: 'Diagnostics', description: '供应商诊断' },
    { name: 'Relay', description: '图像生成代理与异步任务' }
  ]
};

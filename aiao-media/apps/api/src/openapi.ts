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

const ImageRelayInputSchema = z
  .object({
    model: z.string().min(1).max(80).openapi({ example: 'standard' }),
    prompt: z.string().min(1).max(2000).openapi({ example: 'A quiet forest at sunrise' }),
    n: z.literal(1),
    size: z.enum(['1024x1024', '1536x1024', '1024x1536'])
  })
  .openapi('ImageRelayInput');

const RelayTaskHeadersSchema = z
  .object({
    authorization: z
      .string()
      .regex(/^Bearer [A-Za-z0-9._~-]+$/)
      .openapi({
        param: { name: 'authorization', in: 'header' },
        example: 'Bearer platform-session'
      }),
    'x-relay-task-token': z.string().openapi({
      param: { name: 'x-relay-task-token', in: 'header' },
      example: 'relay-task-token'
    })
  })
  .openapi('RelayTaskHeaders');

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
  models: createRoute({
    method: 'get',
    path: '/api/models',
    tags: ['Relay'],
    responses: {
      200: {
        description: '公开平台模型目录，不含上游型号、地址或凭据',
        content: {
          'application/json': {
            schema: z.object({
              models: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  credits: z.number().int().positive(),
                  protocol: z.enum(['openai', 'minimax'])
                })
              )
            })
          }
        }
      },
      503: { description: '平台模型尚未就绪', content: { 'application/json': { schema: ApiErrorSchema } } }
    }
  }),
  relayTaskConfirm: createRoute({
    method: 'post',
    path: '/api/relay/tasks/{taskId}/confirm',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: z.object({ 'x-relay-task-token': RelayTaskHeadersSchema.shape['x-relay-task-token'] })
    },
    responses: {
      204: { description: '本机图片验证成功，幂等扣减预占积分' },
      404: { description: '任务不存在或已过期', content: { 'application/json': { schema: ApiErrorSchema } } },
      409: { description: '结果未就绪或预占已释放', content: { 'application/json': { schema: ApiErrorSchema } } }
    }
  }),
  relayTaskDiscard: createRoute({
    method: 'post',
    path: '/api/relay/tasks/{taskId}/discard',
    tags: ['Relay'],
    request: {
      params: TaskIdParamsSchema,
      headers: z.object({ 'x-relay-task-token': RelayTaskHeadersSchema.shape['x-relay-task-token'] })
    },
    responses: {
      204: { description: '本机图片校验失败，释放预占积分' },
      404: { description: '任务不存在', content: { 'application/json': { schema: ApiErrorSchema } } },
      409: { description: '任务仍在执行或已扣积分', content: { 'application/json': { schema: ApiErrorSchema } } }
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
      401: { description: '需要有效平台账号', content: { 'application/json': { schema: ApiErrorSchema } } },
      402: { description: '可用积分不足，未调用上游', content: { 'application/json': { schema: ApiErrorSchema } } },
      409: { description: '任务标识已封存或参数冲突', content: { 'application/json': { schema: ApiErrorSchema } } },
      503: { description: '模型或持久任务服务未就绪', content: { 'application/json': { schema: ApiErrorSchema } } },
      202: {
        description: '预占成功，任务已提交',
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
        description: '任务已接单，继续查询原任务',
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
    { name: 'Relay', description: '平台积分生图与持久任务' }
  ]
};

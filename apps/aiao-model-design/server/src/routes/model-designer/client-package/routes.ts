import { Elysia, t } from 'elysia';
import { ClientPackageError } from './npm-runner';
import type { ClientPackageService } from './service';

const ClientPackagePropertySchema = t.Object({
  name: t.String(),
  columnName: t.Optional(t.String()),
  type: t.String(),
  required: t.Optional(t.Boolean()),
  nullable: t.Optional(t.Boolean()),
  unique: t.Optional(t.Boolean())
});

const ClientPackageRelationSchema = t.Object({
  name: t.String(),
  kind: t.String(),
  mappedEntity: t.String(),
  mappedProperty: t.Optional(t.String())
});

const ClientPackageRequestSchema = t.Object({
  packageName: t.String(),
  generatedFiles: t.Array(t.Object({ path: t.String(), content: t.String() })),
  designContract: t.Object({
    entities: t.Array(
      t.Object({
        name: t.String(),
        namespace: t.Optional(t.String()),
        tableName: t.Optional(t.String()),
        properties: t.Array(ClientPackagePropertySchema),
        relations: t.Array(ClientPackageRelationSchema)
      }),
      { maxItems: 100 }
    ),
    metadata: t.Record(t.String(), t.String())
  })
});

function packageErrorResponse(error: unknown): Response {
  if (!(error instanceof ClientPackageError)) throw error;
  return new Response(JSON.stringify({ error: error.code, message: error.message }), {
    status: error.status,
    headers: { 'content-type': 'application/json' }
  });
}

/** 创建 ModelDesigner 客户端 npm 包的 archive/publish 子路由。 */
export function createClientPackageRoutes(clientPackages: Pick<ClientPackageService, 'archive' | 'publish'>) {
  return new Elysia()
    .post(
      '/client-packages/archive',
      async ({ body }) => {
        try {
          const archive = await clientPackages.archive(body);
          return new Response(new Blob([archive.bytes as BlobPart], { type: 'application/gzip' }), {
            headers: {
              'content-type': 'application/gzip',
              'content-disposition': `attachment; filename="${archive.filename}"`,
              'x-package-name': archive.packageName,
              'x-package-version': archive.version,
              'x-design-revision': archive.designRevision
            }
          });
        } catch (error) {
          return packageErrorResponse(error);
        }
      },
      { body: ClientPackageRequestSchema }
    )
    .post(
      '/client-packages/publish',
      async ({ body }) => {
        try {
          return await clientPackages.publish(body);
        } catch (error) {
          return packageErrorResponse(error);
        }
      },
      { body: ClientPackageRequestSchema }
    );
}

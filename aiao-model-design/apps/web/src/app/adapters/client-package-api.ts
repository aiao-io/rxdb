import type {
  ClientPackageAdapter,
  ClientPackageArchive,
  ClientPackagePublication,
  ClientPackageRequest
} from '../model-designer';

const ARCHIVE_URL = '/api/model-designer/client-packages/archive';
const PUBLISH_URL = '/api/model-designer/client-packages/publish';

function requiredHeader(response: Response, name: string): string {
  const value = response.headers.get(name);
  if (!value) throw new Error(`Client package response is missing ${name}`);
  return value;
}

function archiveFilename(response: Response, packageName: string, version: string): string {
  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? `${packageName.replace('@', '').replace('/', '-')}-${version}.tgz`;
}

async function apiError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as unknown;
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return new Error(body.message);
  }
  return new Error(`Client package request failed with HTTP ${response.status}`);
}

async function archive(request: ClientPackageRequest): Promise<ClientPackageArchive> {
  const response = await fetch(ARCHIVE_URL, {
    method: 'POST',
    headers: { accept: 'application/gzip', 'content-type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'include'
  });
  if (!response.ok) throw await apiError(response);

  const packageName = requiredHeader(response, 'x-package-name');
  const version = requiredHeader(response, 'x-package-version');
  const designRevision = requiredHeader(response, 'x-design-revision');
  const bytes = await response.arrayBuffer();
  return {
    blob: new Blob([bytes], { type: 'application/gzip' }),
    packageName,
    version,
    designRevision,
    filename: archiveFilename(response, packageName, version)
  };
}

async function publish(request: ClientPackageRequest): Promise<ClientPackagePublication> {
  const response = await fetch(PUBLISH_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'include'
  });
  if (!response.ok) throw await apiError(response);
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object') throw new Error('Client package publish response is invalid');
  const publication = body as Record<string, unknown>;
  if (
    typeof publication['packageName'] !== 'string' ||
    typeof publication['version'] !== 'string' ||
    typeof publication['designRevision'] !== 'string' ||
    publication['status'] !== 'published'
  ) {
    throw new Error('Client package publish response is invalid');
  }
  return {
    packageName: publication['packageName'],
    version: publication['version'],
    designRevision: publication['designRevision'],
    status: 'published'
  };
}

/** Dashboard 提供给模型设计器的客户端包 HTTP adapter。 */
export const clientPackageApi: ClientPackageAdapter = {
  archive,
  publish
};

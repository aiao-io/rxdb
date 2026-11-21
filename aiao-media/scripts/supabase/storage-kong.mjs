import { parse } from 'yaml';

/** 原图跨来源传输与续传必须可读取服务端文件长度、进度和会话位置。 */
export function storageKongConfiguration(template, origins) {
  const kong = parse(template);
  const cors = kong.plugins.find(plugin => plugin.name === 'cors').config;
  cors.origins = origins;
  cors.headers.push('X-Upsert', 'Tus-Resumable', 'Upload-Length', 'Upload-Offset', 'Upload-Metadata');
  cors.exposed_headers.push('Location', 'Upload-Length', 'Upload-Offset', 'Tus-Resumable');
  kong.services.push({
    name: 'storage',
    url: 'http://storage:5000/',
    routes: [{ name: 'storage', paths: ['/storage/v1/'], strip_path: true }]
  });
  return kong;
}

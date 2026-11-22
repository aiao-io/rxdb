import { expect, it, vi } from 'vitest';
import { desktopWorkspaceBackend } from './desktop-workspace.js';

it('从宿主打开二进制文件并携带原版本保存，冲突原样返回', async () => {
  const call = vi.fn().mockResolvedValueOnce({ projectId: 'repo', revision: 7, files: [{ path: 'pic.png', bytes: 'AP8=' }] }).mockRejectedValueOnce(new Error('Expected revision 7, current revision is 8'));
  const backend = desktopWorkspaceBackend({ call });
  const snapshot = await backend.open('repo');
  expect(snapshot.files['pic.png']).toEqual(Uint8Array.of(0, 255));
  await expect(backend.save('repo', { 'a.txt': '改' }, snapshot.revision, ['pic.png'])).rejects.toThrow('revision');
  expect(call.mock.calls[1]?.[0]).toEqual({ projectId: 'repo', operation: 'save', files: [{ path: 'a.txt', base64: '5pS5' }], expectedRevision: 7, removedPaths: ['pic.png'] });
});

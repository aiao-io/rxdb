import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { OPFSFileEntry } from '../utils/opfs-utils';
import OpfsFilePreview from './OpfsFilePreview.vue';

const service = vi.hoisted(() => ({ previewFile: vi.fn() }));
vi.mock('../composables/useOpfsService', () => ({ useOpfsService: () => service }));

afterEach(() => {
  service.previewFile.mockReset();
  vi.restoreAllMocks();
});

const entry = (name: string): OPFSFileEntry => ({
  name,
  path: `/${name}`,
  kind: 'file',
  handle: {} as FileSystemFileHandle
});
const A = entry('a.txt');
const B = entry('b.txt');

const probe = async (overlap: boolean) => {
  const text = Promise.withResolvers<string>();
  const started = Promise.withResolvers<void>();
  const blob = new Blob(['old-A']);
  vi.spyOn(blob, 'text').mockImplementation(() => {
    started.resolve();
    return text.promise;
  });
  service.previewFile.mockImplementation(async (file: OPFSFileEntry) => ({
    data: file.path === A.path ? blob : 'new-B',
    type: 'text/plain'
  }));
  const wrapper = mount(OpfsFilePreview, { props: { entry: A }, attachTo: document.body });
  try {
    await started.promise;
    if (!overlap) {
      text.resolve('old-A');
      await flushPromises();
    }
    await wrapper.setProps({ entry: B });
    await flushPromises();
    expect(wrapper.find('h3').text()).toBe(B.name);
    expect(wrapper.find('pre').text()).toBe('new-B');
    text.resolve('old-A');
    await flushPromises();
    await nextTick();
    console.info(
      'REVIEW_PREVIEW',
      JSON.stringify({ framework: 'vue', overlap, title: wrapper.find('h3').text(), text: wrapper.find('pre').text() })
    );
    expect(wrapper.find('pre').text()).toBe('new-B');
  } finally {
    text.resolve('old-A');
    await flushPromises();
    wrapper.unmount();
  }
};

describe('评审复验：previewFile 之后的 Blob.text 仍须属于当前文件', () => {
  it('A 的文本读取迟到时不能覆盖已经完成的 B', () => probe(true));
  it('对照：先结束 A 的文本读取再切换 B，显示 B', () => probe(false));
});

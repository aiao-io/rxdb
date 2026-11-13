import { describe, expect, it, vi } from 'vitest';
import type { ProductAuthorization } from '../app/supabase-auth';
import { ImageDeleteController } from './image-delete';
import type { RemoteFileRecord } from './image-sync';

const sourceId='10000000-0000-4000-8000-000000000001';
const workspaceId='10000000-0000-4000-8000-000000000002';
const userId='10000000-0000-4000-8000-000000000003';
const fileId='10000000-0000-4000-8000-000000000004';
const requestId='10000000-0000-4000-8000-000000000005';
const digest='a'.repeat(64);
const access={config:{url:'https://abcdefghijklmnopqrst.supabase.co',anonKey:'sb_publishable_fixture'},userId,session:{access_token:'fixture-session'}} as ProductAuthorization;
const file:RemoteFileRecord={id:fileId,workspaceId,sourceId,version:digest,path:`${userId}/${workspaceId}/${sourceId}/${digest}.png`,mimeType:'image/png',width:1,height:1,bytes:10,sha256:digest,status:'uploaded',deleted:false,revision:1,baseRevision:0};
const capabilities={protocol:1,privateBucket:'aiao-media-images',maxBytes:16777216,resumable:true,metadataOnly:false,lifecycle:1,deletion:1,references:1};
const receipt=(state:'pending'|'complete'='pending')=>({id:requestId,workspaceId,fileId,sourceId,version:digest,path:file.path,state,createdBy:userId,createdAt:'2026-11-14T00:00:00Z',completedAt:state==='complete'?'2026-11-14T00:01:00Z':null});
const review=()=>({file,workRevision:1,retainedReferences:0,conflictReferences:0,pendingTransfers:0,unknownHistory:0,retainedVersions:2,allowed:true,deletion:null});
function rig() {
  const preferences=new Map<string,{payload:string;revision:number}>();
  const store={ensurePreference:vi.fn(async(key:string,payload:string)=>{
    if(!preferences.has(key)) preferences.set(key,{payload,revision:1});
    return preferences.get(key)!;
  })};
  const calls:{url:string;method:string;body:Record<string,unknown>|undefined;signal:AbortSignal|null|undefined}[]=[];
  let completeCalls=0;
  const route=vi.fn(async(url:string,init?:RequestInit):Promise<Response>=>{
    if(url.includes('media_file_capabilities')) return Response.json(capabilities);
    if(url.includes('/media_file_records')) return Response.json([file]);
    if(url.includes('media_preview_image_delete')) return Response.json(review());
    if(url.includes('media_begin_image_delete')) return Response.json(receipt());
    if(url.includes('media_complete_image_delete')) return Response.json(receipt(++completeCalls>=2?'complete':'pending'));
    return Response.json([{name:file.path}]);
  });
  const request=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    init?.signal?.throwIfAborted();
    calls.push({url:String(input),method:init?.method??'GET',body:typeof init?.body==='string'?JSON.parse(init.body):undefined,signal:init?.signal});
    return route(String(input),init);
  });
  return {preferences,store,calls,request,route,controller:new ImageDeleteController(store,access,workspaceId,request)};
}

describe('远端原图删除与恢复',()=>{
  it('预览只读取准确的账号工作区和摘要，不写设备意图或发送删除',async()=>{
    const r=rig();
    const selection=await r.controller.preview(sourceId,digest);
    expect(selection).toMatchObject({file,retainedVersions:2,allowed:true});
    expect(r.store.ensurePreference).not.toHaveBeenCalled();
    expect(r.calls.some(call=>call.url.includes('media_begin_image_delete')||call.method==='DELETE')).toBe(false);
    expect(r.calls.find(call=>call.url.includes('/media_file_records'))?.url).toContain(`workspaceId=eq.${workspaceId}`);
    expect(r.calls.find(call=>call.url.includes('/media_file_records'))?.url).toContain(`sha256=eq.${digest}`);
  });
  it('明确确认后先设备写盘、再文件删标，最后 Storage 删除并核对完成回执',async()=>{
    const r=rig();
    const staged=vi.fn(async()=>{
      expect(r.calls.some(call=>call.url.includes('media_begin_image_delete'))).toBe(true);
      expect(r.calls.some(call=>call.method==='DELETE')).toBe(false);
    });
    const result=await r.controller.confirm(review(),staged);
    expect(result.state).toBe('complete');
    expect(staged).toHaveBeenCalledOnce();
    expect(r.preferences.size).toBe(1);
    const journal=JSON.parse([...r.preferences.values()][0].payload);
    expect(journal).toMatchObject({version:1,fileId});
    expect(JSON.stringify(journal)).not.toMatch(/fixture-session|sb_publishable|access_token/);
    const beginning=r.calls.find(call=>call.url.includes('media_begin_image_delete'))!;
    expect(beginning.body).toMatchObject({p_file_id:fileId,p_file_revision:1,p_work_revision:1,p_request_id:expect.any(String)});
    const deletion=r.calls.find(call=>call.method==='DELETE')!;
    expect(deletion.url).toBe('https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/object/aiao-media-images');
    expect(deletion.body).toEqual({prefixes:[file.path]});
    expect(r.request).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({credentials:'omit',cache:'no-store',redirect:'error'}));
  });
  it('写盘失败和已中止操作都不能提交远端删标',async()=>{
    const r=rig();
    r.store.ensurePreference.mockRejectedValueOnce(new Error('disk full'));
    await expect(r.controller.confirm(review())).rejects.toThrow('disk full');
    expect(r.calls.some(call=>call.url.includes('media_begin_image_delete'))).toBe(false);
    const lifetime=new AbortController();
    lifetime.abort(new Error('changed account'));
    await expect(new ImageDeleteController(r.store,access,workspaceId,r.request,lifetime.signal).confirm(review())).rejects.toThrow('changed account');
    expect(r.preferences.size).toBe(0);
  });
  it('删除应答丢失后重开沿用持久请求，核对已消失对象后不再重发 Storage 删除',async()=>{
    const r=rig();
    const normal=r.route.getMockImplementation()!;
    let lost=true;
    r.route.mockImplementation(async(url,init)=>{
      if(init?.method==='DELETE'&&lost){lost=false;throw new TypeError('ack lost');}
      if(url.includes('media_complete_image_delete')&&!lost) return Response.json(receipt('complete'));
      return normal(url,init);
    });
    await expect(r.controller.confirm(review())).rejects.toThrow('ack lost');
    const before=r.calls.filter(call=>call.url.includes('media_begin_image_delete'))[0].body?.['p_request_id'];
    const reopened=new ImageDeleteController(r.store,access,workspaceId,r.request);
    expect((await reopened.confirm(review())).state).toBe('complete');
    const requests=r.calls.filter(call=>call.url.includes('media_begin_image_delete'));
    expect(requests[1].body?.['p_request_id']).toBe(before);
    expect(r.calls.filter(call=>call.method==='DELETE')).toHaveLength(1);
  });
  it('Storage 返回 200 但对象仍存在时，保持待确认回执',async()=>{
    const r=rig();
    const normal=r.route.getMockImplementation()!;
    r.route.mockImplementation(async(url,init)=>url.includes('media_complete_image_delete')?Response.json(receipt()):normal(url,init));
    expect((await r.controller.confirm(review())).state).toBe('pending');
    expect(r.preferences.size).toBe(1);
  });
  it.each(['retainedReferences','conflictReferences','pendingTransfers','unknownHistory'] as const)('存在 %s 时保留原对象且不提交删除',async field=>{
    const r=rig();
    await expect(r.controller.confirm({...review(),[field]:1,allowed:false})).rejects.toThrow('引用');
    expect(r.calls.some(call=>call.url.includes('media_begin_image_delete')||call.method==='DELETE')).toBe(false);
    expect(r.preferences.size).toBe(0);
  });
  it('旧文件服务缺少删除保护时拒绝，不影响元数据协议',async()=>{
    const r=rig();
    r.route.mockResolvedValue(Response.json({...capabilities,deletion:undefined}));
    await expect(r.controller.preview(sourceId,digest)).rejects.toThrow('删除');
    expect(r.store.ensurePreference).not.toHaveBeenCalled();
  });
  it('删标提交后作用域中止，迟到回执不能触发 Storage 删除',async()=>{
    const r=rig(),lifetime=new AbortController();
    const normal=r.route.getMockImplementation()!;
    r.route.mockImplementation(async(url,init)=>{
      const response=await normal(url,init);
      if(url.includes('media_begin_image_delete')) lifetime.abort(new Error('account switched'));
      return response;
    });
    await expect(new ImageDeleteController(r.store,access,workspaceId,r.request,lifetime.signal).confirm(review())).rejects.toThrow('account switched');
    expect(r.calls.some(call=>call.method==='DELETE')).toBe(false);
  });
  it('路径替换、错版本回执与未知设备日志版本都拒绝且保留现场',async()=>{
    const r=rig();
    await expect(r.controller.confirm({...review(),file:{...file,path:file.path.replace(sourceId,workspaceId)}})).rejects.toThrow('身份');
    const normal=r.route.getMockImplementation()!;
    r.route.mockImplementation(async(url,init)=>url.includes('media_begin_image_delete')?Response.json({...receipt(),version:'b'.repeat(64)}):normal(url,init));
    await expect(r.controller.confirm(review())).rejects.toThrow('回执');
    expect(r.calls.some(call=>call.method==='DELETE')).toBe(false);
    const [key,row]=[...r.preferences][0];
    const damaged={...row,payload:JSON.stringify({...JSON.parse(row.payload),version:2})};
    r.preferences.set(key,damaged);
    await expect(r.controller.confirm(review())).rejects.toThrow('日志');
    expect(r.preferences.get(key)).toEqual(damaged);
  });
});

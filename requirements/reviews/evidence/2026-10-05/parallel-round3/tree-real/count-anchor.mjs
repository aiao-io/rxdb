import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { TreeEntity, TreeAdjacencyListEntityBase, rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { firstValueFrom } from 'rxjs';
import assert from 'node:assert/strict';
const Node = TreeEntity({name:'ReviewMissingAnchor',properties:[{name:'id',type:PropertyType.integer,primary:true},{name:'name',type:PropertyType.string}]})(class extends TreeAdjacencyListEntityBase {});
const db=new RxDB({dbName:'r3-count-anchor',context:{userId:'review'},entities:[Node],sync:{local:{adapter:'pglite'},type:SyncType.None}}).use(rxDBPluginTree);
db.adapter('pglite', rxdb=>new RxDBAdapterPGlite(rxdb,{store:'memory'}));
try {
 const adapter=await db.connect('pglite');
 for(const record of [{id:0,name:'root',parentId:null},{id:1,name:'child',parentId:0}]) await new Node(record).save();
 const repository=adapter.getRepository(Node);
 const existing={descendants:await repository.countDescendants({entityId:0}),ancestors:await repository.countAncestors({entityId:1})};
 assert.deepEqual(existing,{descendants:1,ancestors:1});
 const missing={descendants:await repository.countDescendants({entityId:42}),ancestors:await repository.countAncestors({entityId:42}),rows:(await repository.findDescendants({entityId:42})).length};
 await (await firstValueFrom(Node.get(0))).remove();
 const removed={descendants:await repository.countDescendants({entityId:0}),ancestors:await repository.countAncestors({entityId:0}),rows:(await repository.findDescendants({entityId:0})).length};
 console.log(JSON.stringify({existing,missing,removed}));
 assert.deepEqual(missing,{descendants:0,ancestors:0,rows:0});
 assert.deepEqual(removed,{descendants:0,ancestors:0,rows:0});
}finally{await db.destroy();}

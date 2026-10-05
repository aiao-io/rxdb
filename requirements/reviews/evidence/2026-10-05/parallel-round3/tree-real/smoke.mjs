import { RxDB, SyncType, PropertyType } from '@aiao/rxdb';
import { TreeEntity, TreeAdjacencyListEntityBase, rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { firstValueFrom } from 'rxjs';
const Node = TreeEntity({name:'ReviewRealTree',log:false,properties:[{name:'id',type:PropertyType.integer,primary:true},{name:'name',type:PropertyType.string}]})(class extends TreeAdjacencyListEntityBase {});
const db=new RxDB({dbName:'review-r3-real-tree',context:{userId:'review'},entities:[Node],sync:{local:{adapter:'pglite'},type:SyncType.None}}).use(rxDBPluginTree);
db.adapter('pglite', rxdb=>new RxDBAdapterPGlite(rxdb,{store:'memory'}));
try {
 await db.connect('pglite');
 for(const record of [{id:0,name:'zero',parentId:null},{id:1,name:'child',parentId:0},{id:2,name:'leaf',parentId:1},{id:9,name:'other',parentId:null}]) await new Node(record).save();
 const values=await firstValueFrom(Node.findDescendants({entityId:0}));
 const leaf=await firstValueFrom(Node.get(2));
 console.log('descendants', values.map(v=>v.id), 'count', await firstValueFrom(Node.countDescendants({entityId:0})), 'ancestors', (await firstValueFrom(Node.findAncestors({entityId:2}))).map(v=>v.id));
 leaf.parentId=9;await leaf.save();
 console.log('after move', (await firstValueFrom(Node.findDescendants({entityId:0}))).map(v=>v.id));
 const root=await firstValueFrom(Node.get(0));await root.remove();
 console.log('after delete', (await firstValueFrom(Node.findDescendants({entityId:0}))).map(v=>v.id));
} finally {await db.destroy();}

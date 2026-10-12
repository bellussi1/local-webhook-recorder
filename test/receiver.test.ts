import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request,Agent} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../dist/store.js';
import {startReceiver} from '../dist/receiver.js';
const send=(port:number,body:Buffer,options:{path?:string;method?:string;chunked?:boolean;agent?:Agent}={})=>new Promise<{status:number;body:string}>((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port,path:options.path??'/webhooks',method:options.method??'POST',agent:options.agent,headers:{Authorization:'SECRET_HEADER','content-type':'application/octet-stream',...(options.chunked?{}:{'content-length':body.length})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode!,body:text}));});
  req.on('error',reject);if(options.chunked){req.write(body.subarray(0,600000));req.write(body.subarray(600000));req.end();}else req.end(body);
});
test('receiver captures bytes and rejects methods/routes without writes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-'));const store=openStore(join(dir,'db.sqlite'),'write');const events:any[]=[];const receiver=await startReceiver(store,0,event=>events.push(event));
  try{
    const response=await send(receiver.port,Buffer.from([0,255,10]));assert.equal(response.status,202);
    const id=JSON.parse(response.body).id;assert.deepEqual(Array.from(store.get(id)!.body),[0,255,10]);assert.equal(JSON.stringify(events).includes('body'),false);
    assert.equal((await send(receiver.port,Buffer.from('{bad'))).status,202);
    assert.equal((await send(receiver.port,Buffer.alloc(0),{method:'GET'})).status,405);
    assert.equal((await send(receiver.port,Buffer.alloc(0),{path:'/other'})).status,404);assert.equal(store.list(20).length,2);
  }finally{await receiver.close();store.close();await rm(dir,{recursive:true,force:true});}
});
test('body boundary and chunked overflow never persist partial events',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-'));const store=openStore(join(dir,'db.sqlite'),'write');const receiver=await startReceiver(store,0,()=>{});
  try{
    assert.equal((await send(receiver.port,Buffer.alloc(1048576))).status,202);
    assert.equal((await send(receiver.port,Buffer.alloc(1048577))).status,413);
    assert.equal((await send(receiver.port,Buffer.alloc(1048577),{chunked:true})).status,413);
    assert.equal(store.list(20).length,1);assert.equal((await send(receiver.port,Buffer.from('ok'))).status,202);
    await new Promise<void>(resolve=>{const req=request({host:'127.0.0.1',port:receiver.port,path:'/webhooks',method:'POST',headers:{'content-length':1000}});req.on('error',()=>resolve());req.write('partial');req.destroy();});
    assert.equal(store.list(20).length,2);
  }finally{await receiver.close();store.close();await rm(dir,{recursive:true,force:true});}
});
test('bind conflicts are classified and keepalive shutdown is bounded',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-'));const store=openStore(join(dir,'db.sqlite'),'write');const receiver=await startReceiver(store,0,()=>{});const agent=new Agent({keepAlive:true});
  try{
    await assert.rejects(startReceiver(store,receiver.port,()=>{}),error=>(error as any).code==='BIND_FAILED');
    await send(receiver.port,Buffer.from('ok'),{agent});const start=Date.now();await receiver.close();assert.ok(Date.now()-start<2000);
  }finally{agent.destroy();await receiver.close();store.close();await rm(dir,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../dist/store.js';
import {selectHeaders} from '../dist/headers.js';

test('durable bytes and metadata survive restart without secret headers',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-'));const path=join(dir,'events.sqlite');
  try{
    const store=openStore(path,'write');
    const summary=store.insert({method:'POST',path:'/webhooks',headers:{Authorization:'secret',Cookie:'secret','Content-Type':'application/octet-stream','user-agent':'test','x-request-id':'42'},body:new Uint8Array([0,255,10])});
    assert.match(summary.id,/^[a-f0-9-]{36}$/);assert.match(summary.receivedAt,/Z$/);assert.equal(summary.sizeBytes,3);
    assert.equal('body' in summary,false);store.close();
    const reader=openStore(path,'read');try{
      assert.deepEqual(Array.from(reader.get(summary.id)!.body),[0,255,10]);
      assert.deepEqual(reader.get(summary.id)!.headers,{'content-type':'application/octet-stream','user-agent':'test','x-request-id':'42'});
      assert.equal(reader.list(20).length,1);assert.equal(JSON.stringify(reader.list(20)).includes('secret'),false);
    }finally{reader.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('header allowlist normalizes names and rejects credentials',()=>{
  assert.deepEqual(selectHeaders({'Content-Type':'application/json','X-Request-Id':['a','b'],Authorization:'secret','x-api-key':'secret'}),{'content-type':'application/json','x-request-id':'a,b'});
});
test('retention prunes oldest events and list is bounded',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-'));const store=openStore(join(dir,'events.sqlite'),'write');
  try{let first='';let last='';for(let i=0;i<1001;i++){const item=store.insert({method:'POST',path:'/webhooks',headers:{},body:new Uint8Array()});if(i===0)first=item.id;last=item.id;}
    assert.equal(store.get(first),undefined);assert.ok(store.get(last));assert.equal(store.list(100).length,100);assert.equal(store.list(1)[0]!.id,last);
    assert.throws(()=>store.list(101));
  }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('read commands never create databases; incompatible databases remain intact',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-'));const path=join(dir,'missing.sqlite');
  try{
    assert.throws(()=>openStore(path,'read'));await assert.rejects(stat(path));
    for(const setup of ['PRAGMA user_version=99','CREATE TABLE unrelated(x)','CREATE VIEW unrelated AS SELECT 1',
      'CREATE TABLE events(seq INTEGER,id TEXT,received_at TEXT,method TEXT,path TEXT,headers TEXT,body BLOB,size_bytes INTEGER); PRAGMA user_version=1']){
      const db=new DatabaseSync(path);db.exec(setup);db.close();const before=await readFile(path);
      assert.throws(()=>{const unexpected=openStore(path,'write');unexpected.close();});assert.deepEqual(await readFile(path),before);await rm(path);
    }
    await writeFile(path,'not sqlite');const before=await readFile(path);assert.throws(()=>{const unexpected=openStore(path,'write');unexpected.close();});assert.deepEqual(await readFile(path),before);
  }finally{await rm(dir,{recursive:true,force:true});}
});


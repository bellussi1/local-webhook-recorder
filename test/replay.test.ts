import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {validateDestination,replayEvent} from '../dist/replay.js';
const event={id:'test',receivedAt:new Date().toISOString(),method:'POST',path:'/webhooks',sizeBytes:3,headers:{'content-type':'application/octet-stream',Authorization:'SECRET','Cookie':'SECRET','x-signature':'SECRET'},body:new Uint8Array([0,255,10])};
test('destinations require literal loopback HTTP without credentials',()=>{
  for(const good of ['http://127.0.0.1:3000/webhooks','http://[::1]:3000/webhooks'])assert.ok(validateDestination(good));
  for(const bad of ['http://localhost:3000','https://127.0.0.1','http://user:pass@127.0.0.1','http://example.com','http://127.1','http://2130706433','http://0x7f000001','/relative'])assert.throws(()=>validateDestination(bad));
});
test('replay sends original bytes with safe headers, classifies statuses and refuses redirects',async()=>{
  let hits=0;let received:Buffer|undefined;let headers:any;
  const server=createServer((req,res)=>{hits++;headers=req.headers;const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
    received=Buffer.concat(chunks);
    if(req.url==='/bad'){res.statusCode=500;res.end('SECRET_RESPONSE');}
    else if(req.url==='/redirect'){res.writeHead(302,{location:'/other'});res.end();}
    else if(req.url==='/slowbody'){res.writeHead(200);res.flushHeaders();}
    else res.end('SECRET_RESPONSE');
  });});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as any;const base=`http://127.0.0.1:${address.port}`;
  try{
    const ok=await replayEvent(event,base+'/ok');assert.deepEqual(ok,{passed:true,code:'REPLAY_OK',status:200});assert.deepEqual(Array.from(received!),[0,255,10]);
    assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined);assert.equal(headers['x-signature'],undefined);assert.equal(headers['content-length'],'3');assert.equal(headers.host,`127.0.0.1:${address.port}`);
    assert.equal((await replayEvent(event,base+'/bad')).code,'REPLAY_STATUS');
    const before=hits;assert.equal((await replayEvent(event,base+'/redirect')).code,'REPLAY_REDIRECT');assert.equal(hits,before+1);
    const start=Date.now();assert.equal((await replayEvent(event,base+'/slowbody')).passed,true);assert.ok(Date.now()-start<1000);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  assert.equal((await replayEvent(event,base)).code,'REPLAY_CONNECTION');
});
test('replay times out when response headers never arrive',async()=>{
  const server=createServer(()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as any;
  try{const start=Date.now();assert.equal((await replayEvent(event,`http://127.0.0.1:${address.port}`)).code,'REPLAY_TIMEOUT');assert.ok(Date.now()-start>=4800);assert.ok(Date.now()-start<7000);}
  finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

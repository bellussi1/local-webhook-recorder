import type {EventStore,EventSummary} from './types.js';
import {createServer} from 'node:http';
import {RecorderError} from './errors.js';
import {selectHeaders} from './headers.js';
const MAX_BODY=1048576;
export async function startReceiver(store:EventStore,port:number,onEvent:(event:EventSummary)=>void):Promise<{port:number;close():Promise<void>}>{
  const server=createServer((req,res)=>{
    const reply=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    if(req.url!=='/webhooks'){req.resume();reply(404,{error:'NOT_FOUND'});return;}
    if(req.method!=='POST'){req.resume();res.setHeader('allow','POST');reply(405,{error:'METHOD_NOT_ALLOWED'});return;}
    let size=0;let rejected=false;const chunks:Buffer[]=[];
    const rejectBody=()=>{rejected=true;chunks.length=0;res.setHeader('connection','close');reply(413,{error:'BODY_TOO_LARGE'});req.resume();};
    if(Number(req.headers['content-length'])>MAX_BODY){rejectBody();return;}
    req.on('data',(chunk:Buffer)=>{if(rejected)return;size+=chunk.length;if(size>MAX_BODY){rejectBody();return;}chunks.push(chunk);});
    req.on('error',()=>{rejected=true;chunks.length=0;});
    req.on('aborted',()=>{rejected=true;chunks.length=0;});
    req.on('end',()=>{
      if(rejected||!req.complete)return;
      try{
        const summary=store.insert({method:'POST',path:'/webhooks',headers:selectHeaders(req.headers),body:Buffer.concat(chunks,size)});
        reply(202,{id:summary.id});onEvent(summary);
      }catch{if(!res.headersSent)reply(500,{error:'STORAGE_FAILED'});}
    });
  });
  server.headersTimeout=10000;server.requestTimeout=15000;
  server.on('clientError',(_error,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
  await new Promise<void>((resolve,reject)=>{server.once('error',()=>reject(new RecorderError('BIND_FAILED')));server.listen(port,'127.0.0.1',resolve);});
  const address=server.address();if(!address||typeof address==='string')throw new RecorderError('BIND_FAILED');
  let closing:Promise<void>|undefined;
  return {port:address.port,close(){
    closing??=new Promise<void>(resolve=>{const timer=setTimeout(()=>server.closeAllConnections(),1000);server.close(()=>{clearTimeout(timer);resolve();});server.closeIdleConnections();});
    return closing;
  }};
}

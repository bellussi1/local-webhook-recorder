import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
export function createDemoHandler(){
  const processed=new Set();
  return createServer((req,res)=>{
    if(req.method!=='POST'||req.url!=='/webhooks'){res.writeHead(404);res.end();return;}
    let text='';
    req.on('data',chunk=>{text+=chunk;if(text.length>1048576)req.destroy();});
    req.on('error',()=>{});
    req.on('end',()=>{
      try{const event=JSON.parse(text);if(typeof event.id!=='string'||!event.id)throw new Error();
        const duplicate=processed.has(event.id);processed.add(event.id);
        res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({status:duplicate?'duplicate':'processed',processedCount:processed.size}));
      }catch{res.writeHead(400);res.end('Invalid demo event');}
    });
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createDemoHandler();server.listen(3000,'127.0.0.1',()=>console.log('Demo handler: http://127.0.0.1:3000/webhooks'));
  process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
}

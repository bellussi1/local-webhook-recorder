import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {createDemoHandler} from '../examples/handler.mjs';
import {openStore} from '../dist/store.js';
import {startReceiver} from '../dist/receiver.js';
import {replayEvent} from '../dist/replay.js';
test('capture then replay twice leaves one logical processed demo event',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-demo-'));const store=openStore(join(dir,'db.sqlite'),'write');const receiver=await startReceiver(store,0,()=>{});const handler=createDemoHandler();handler.listen(0,'127.0.0.1');await once(handler,'listening');const target=`http://127.0.0.1:${(handler.address() as any).port}/webhooks`;
  try{
    const response=await fetch(`http://127.0.0.1:${receiver.port}/webhooks`,{method:'POST',body:JSON.stringify({id:'demo-001',type:'order.created'})});const {id}=await response.json() as any;
    const event=store.get(id)!;assert.equal((await replayEvent(event,target)).passed,true);assert.equal((await replayEvent(event,target)).passed,true);
    const check=await fetch(target,{method:'POST',body:JSON.stringify({id:'demo-001'})});assert.deepEqual(await check.json(),{status:'duplicate',processedCount:1});
  }finally{await receiver.close();handler.closeAllConnections();await new Promise<void>(resolve=>handler.close(()=>resolve()));store.close();await rm(dir,{recursive:true,force:true});}
});
test('installed tarball has runtime only and bin executes capture inspection replay and errors',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-pack-'));let child:ReturnType<typeof spawn>|undefined;
  const npm=(args:string[],cwd:string)=>{const result=spawnSync(process.execPath,[process.env.npm_execpath!,...args],{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
  try{
    const pack=JSON.parse(npm(['pack','--json','--pack-destination',dir],resolve('.')))[0];
    assert.ok(pack.files.some((file:any)=>file.path==='dist/cli.js'));assert.ok(!pack.files.some((file:any)=>/^(src|test|examples)\//.test(file.path)||/\.(sqlite|db)/.test(file.path)));
    await writeFile(join(dir,'package.json'),'{}');npm(['install','--ignore-scripts','--no-audit','--no-fund',join(dir,pack.filename)],dir);
    const bin=join(dir,'node_modules','.bin',process.platform==='win32'?'webhook-recorder.cmd':'webhook-recorder');
    const command=(args:string[])=>process.platform==='win32'?{file:process.env.ComSpec??'cmd.exe',args:['/d','/s','/c',`""${bin}" ${args.join(' ')}"`],options:{windowsVerbatimArguments:true}}:{file:bin,args,options:{}};
    const run=(args:string[])=>{const cmd=command(args);return spawnSync(cmd.file,cmd.args,{...cmd.options,cwd:dir,encoding:'utf8'});};
    assert.equal(run(['--help']).status,0);const missing=run(['list','--json']);assert.equal(missing.status,2);assert.equal(JSON.parse(missing.stdout).error.code,'DB_UNAVAILABLE');
    const temporary=createServer();temporary.listen(0,'127.0.0.1');await once(temporary,'listening');const port=(temporary.address() as any).port;await new Promise<void>(resolve=>temporary.close(()=>resolve()));
    // Use installed runtime directly on Windows so cleanup owns the actual Node PID; bin is exercised for the other commands.
    const serve=command(['serve','--port',String(port),'--json']);child=process.platform==='win32'?spawn(process.execPath,[join(dir,'node_modules','local-webhook-recorder','dist','cli.js'),'serve','--port',String(port),'--json'],{cwd:dir}):spawn(serve.file,serve.args,{...serve.options,cwd:dir});
    const lines=createInterface({input:child.stdout!});await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('ready timeout')),5000);lines.once('line',line=>{clearTimeout(timer);assert.equal(JSON.parse(line).type,'ready');resolve();});});
    const response=await fetch(`http://127.0.0.1:${port}/webhooks`,{method:'POST',body:'demo'});const {id}=await response.json() as any;
    assert.equal(run(['list','--json']).status,0);assert.equal(Buffer.from(JSON.parse(run(['show',id,'--json']).stdout).body.data,'base64').toString(),'demo');
    const handler=createServer((req,res)=>{req.resume();req.on('end',()=>res.end());});handler.listen(0,'127.0.0.1');await once(handler,'listening');
    try{const cmd=command(['replay',id,'--to',`http://127.0.0.1:${(handler.address() as any).port}/webhooks`,'--json']);const replay=spawn(cmd.file,cmd.args,{...cmd.options,cwd:dir});let stdout='';replay.stdout!.on('data',data=>stdout+=data);const [code]=await once(replay,'exit');assert.equal(code,0);assert.equal(JSON.parse(stdout).code,'REPLAY_OK');}
    finally{handler.closeAllConnections();await new Promise<void>(resolve=>handler.close(()=>resolve()));}
    const exited=once(child,'exit');child.kill('SIGTERM');await exited;lines.close();
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}await rm(dir,{recursive:true,force:true});}
});

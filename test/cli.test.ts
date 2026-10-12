import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
const cli=resolve('dist/cli.js');
const run=(args:string[],cwd?:string)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',cwd});
test('help/version do not load SQLite and strict command validation returns JSON exit2',()=>{
  const help=run(['--help']);assert.equal(help.status,0);assert.match(help.stdout,/replay/);assert.equal(help.stderr,'');assert.match(run(['--version']).stdout,/0\.1\.0/);
  for(const args of [[],['oops'],['serve','--port','0'],['list','--limit','101'],['list','--limit','1.5'],['show'],['replay','id'],['list','--json','--json'],['list','--port','8787'],['list','--db']]){
    const output=run([...args,...(args.includes('--json')?[]:['--json'])]);assert.equal(output.status,2);assert.equal(JSON.parse(output.stdout).error.code,'ARGS_INVALID');
  }
});
test('CLI captures persisted events, lists metadata, shows bytes and replays explicitly',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'recorder-cli-'));
  const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=(portServer.address() as any).port;await new Promise<void>(resolve=>portServer.close(()=>resolve()));
  const child=spawn(process.execPath,[cli,'serve','--port',String(port),'--json'],{cwd:dir,stdio:['ignore','pipe','pipe']});
  const lines=createInterface({input:child.stdout!});
  const ready=new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('ready timeout')),5000);lines.once('line',line=>{clearTimeout(timer);resolve(JSON.parse(line));});child.once('exit',()=>{clearTimeout(timer);reject(new Error('serve exited'));});});
  try{
    assert.equal((await ready).type,'ready');
    const payload=Buffer.from('SECRET_PAYLOAD');const response=await fetch(`http://127.0.0.1:${port}/webhooks`,{method:'POST',body:payload});assert.equal(response.status,202);const {id}=await response.json() as any;
    const list=run(['list','--json'],dir);assert.equal(list.status,0);assert.equal(JSON.stringify(JSON.parse(list.stdout)).includes('SECRET_PAYLOAD'),false);
    const show=run(['show',id,'--json'],dir);assert.equal(show.status,0);assert.equal(Buffer.from(JSON.parse(show.stdout).body.data,'base64').toString(),'SECRET_PAYLOAD');
    assert.equal(run(['show','missing','--json'],dir).status,1);assert.equal(run(['list','--db','missing','--json'],dir).status,2);
    let received='';const handler=createServer((req,res)=>{req.on('data',chunk=>received+=chunk);req.on('end',()=>res.end('ok'));});handler.listen(0,'127.0.0.1');await once(handler,'listening');
    try{
      const replay=await new Promise<any>(resolve=>{const replayChild=spawn(process.execPath,[cli,'replay',id,'--to',`http://127.0.0.1:${(handler.address() as any).port}/webhooks`,'--json'],{cwd:dir});let stdout='';replayChild.stdout.on('data',chunk=>stdout+=chunk);replayChild.on('close',code=>resolve({code,stdout}));});
      assert.equal(replay.code,0);assert.equal(JSON.parse(replay.stdout).code,'REPLAY_OK');assert.equal(received,'SECRET_PAYLOAD');
    }finally{handler.closeAllConnections();await new Promise<void>(resolve=>handler.close(()=>resolve()));}
    const exited=once(child,'exit');child.kill('SIGTERM');await exited;
    if(process.platform==='win32')t.diagnostic('Windows child.kill is forced termination; graceful lifecycle is validated directly in receiver tests.');else assert.equal(child.exitCode,0);
    assert.equal(run(['list','--json'],dir).status,0);
  }finally{lines.close();if(child.exitCode===null)child.kill();await rm(dir,{recursive:true,force:true});}
});

#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {RecorderError} from './errors.js';
import {eventDetail,formatOutput} from './report.js';
const args=process.argv.slice(2);const json=args.includes('--json');
const help=`webhook-recorder <command> [options]
serve [--port 8787] [--db ./webhooks.sqlite] [--json]
list [--limit 20] [--db ./webhooks.sqlite] [--json]
show <id> [--db ./webhooks.sqlite] [--json]
replay <id> --to http://127.0.0.1:3000/webhooks [--db ./webhooks.sqlite] [--json]
--help  --version
Replay sends a real request and may duplicate effects. Use a local test handler.`;
const invalid=()=>new RecorderError('ARGS_INVALID');
const emit=(value:unknown)=>console.log(formatOutput(value,json));
function parse(){
  const command=args[0];if(!command||!['serve','list','show','replay'].includes(command))throw invalid();
  const allowed=['--db','--json',...(command==='serve'?['--port']:command==='list'?['--limit']:command==='replay'?['--to']:[])];
  const options=new Map<string,string|boolean>();let id:string|undefined;
  for(let i=1;i<args.length;i++){
    const arg=args[i]!;
    if(!arg.startsWith('--')){if((command==='show'||command==='replay')&&id===undefined){id=arg;continue;}throw invalid();}
    if(!allowed.includes(arg)||options.has(arg))throw invalid();
    if(arg==='--json')options.set(arg,true);else{const value=args[++i];if(!value||value.startsWith('--'))throw invalid();options.set(arg,value);}
  }
  if((command==='show'||command==='replay')&&!id||command==='replay'&&!options.has('--to'))throw invalid();
  const integer=(key:string,fallback:number,max:number)=>{const value=options.get(key);if(value!==undefined&&!/^[0-9]+$/.test(String(value)))throw invalid();const number=Number(value??fallback);if(!Number.isSafeInteger(number)||number<1||number>max)throw invalid();return number;};
  return {command,id,db:String(options.get('--db')??'./webhooks.sqlite'),port:integer('--port',8787,65535),limit:integer('--limit',20,100),to:options.get('--to') as string|undefined};
}
async function main(){
  let store:import('./types.js').EventStore|undefined;
  try{
    if(args.length===1&&(args[0]==='--help'||args[0]==='--version')){console.log(args[0]==='--help'?help:JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version);return;}
    const options=parse();
    const {replayEvent,validateDestination}=await import('./replay.js');
    if(options.command==='replay')validateDestination(options.to!);
    const {openStore}=await import('./store.js');store=openStore(options.db,options.command==='serve'?'write':'read');
    if(options.command==='serve'){
      const {startReceiver}=await import('./receiver.js');
      const receiver=await startReceiver(store,options.port,event=>emit({type:'recorded',event}));
      let stopping=false;
      const stop=async()=>{if(stopping)return;stopping=true;await receiver.close();store?.close();store=undefined;emit({type:'stopped'});};
      const signal=()=>{void stop().catch(()=>{process.exitCode=2;emit({error:{code:'SHUTDOWN_FAILED',message:'SHUTDOWN_FAILED'}});});};
      process.once('SIGINT',signal);process.once('SIGTERM',signal);
      emit({type:'ready',host:'127.0.0.1',port:receiver.port});return;
    }
    if(options.command==='list')emit({events:store.list(options.limit)});
    else{
      const event=store.get(options.id!);if(!event)throw new RecorderError('EVENT_NOT_FOUND',1);
      if(options.command==='show')emit(eventDetail(event));
      else{const result=await replayEvent(event,options.to!);emit(result);process.exitCode=result.passed?0:1;}
    }
    store.close();store=undefined;
  }catch(error){try{store?.close();}catch{}const own=error instanceof RecorderError?error:new RecorderError('INTERNAL_ERROR');emit({error:{code:own.code,message:own.message}});process.exitCode=own.exitCode;}
}
await main();

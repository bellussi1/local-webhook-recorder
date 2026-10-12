import type {RecordedEvent} from './types.js';
import {request} from 'node:http';
import {RecorderError} from './errors.js';
import {selectHeaders} from './headers.js';
export function validateDestination(input:string):URL{
  try{
    if(!/^http:\/\/(127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:[/?#]|$)/.test(input))throw new Error();
    const url=new URL(input);if(url.username||url.password||url.protocol!=='http:')throw new Error();return url;
  }catch{throw new RecorderError('DESTINATION_INVALID');}
}
export async function replayEvent(event:RecordedEvent,target:string):Promise<{passed:boolean;code:string;status?:number}>{
  const url=validateDestination(target);
  return new Promise(resolve=>{
    let finished=false;
    const finish=(result:{passed:boolean;code:string;status?:number})=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result);};
    const req=request(url,{method:event.method,headers:{...selectHeaders(event.headers),'content-length':event.body.byteLength}},res=>{
      const status=res.statusCode!;
      const code=status>=300&&status<400?'REPLAY_REDIRECT':status>=200&&status<300?'REPLAY_OK':'REPLAY_STATUS';
      res.destroy();finish({passed:code==='REPLAY_OK',code,status});
    });
    const timer=setTimeout(()=>{finish({passed:false,code:'REPLAY_TIMEOUT'});req.destroy();},5000);
    req.on('error',()=>finish({passed:false,code:'REPLAY_CONNECTION'}));
    req.end(event.body);
  });
}

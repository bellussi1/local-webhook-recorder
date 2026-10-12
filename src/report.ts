import type {RecordedEvent} from './types.js';
export function eventDetail(event:RecordedEvent){return {...event,body:{encoding:'base64',data:Buffer.from(event.body).toString('base64')}};}
export function formatOutput(value:unknown,json:boolean):string{return JSON.stringify(value,null,json?undefined:2);}

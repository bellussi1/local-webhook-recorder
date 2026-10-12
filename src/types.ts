export type EventSummary = {id:string;receivedAt:string;method:string;path:string;sizeBytes:number};
export type RecordedEvent = EventSummary & {headers:Record<string,string>;body:Uint8Array};
export type NewEvent = {method:string;path:string;headers:Record<string,string>;body:Uint8Array};
export interface EventStore {insert(event:NewEvent):EventSummary;list(limit:number):EventSummary[];get(id:string):RecordedEvent|undefined;close():void;}

import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import type {EventStore,EventSummary,RecordedEvent,NewEvent} from './types.js';
import {RecorderError} from './errors.js';
import {selectHeaders} from './headers.js';

const columns='id, received_at AS receivedAt, method, path, size_bytes AS sizeBytes';
export function openStore(path:string,mode:'write'|'read'):EventStore {
  let db:DatabaseSync|undefined;
  try{
    db=new DatabaseSync(path,{readOnly:mode==='read',timeout:1000});
    const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);
    if(version===0&&mode==='write'){
      if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length)throw new RecorderError('DB_SCHEMA_INVALID');
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,received_at TEXT NOT NULL,method TEXT NOT NULL,path TEXT NOT NULL,headers TEXT NOT NULL,body BLOB NOT NULL,size_bytes INTEGER NOT NULL);
        PRAGMA user_version=1; COMMIT;`);
    }else if(version!==1)throw new RecorderError('DB_SCHEMA_INVALID');
    // Preparing all expected columns also rejects incompatible v1 tables before use.
    db.prepare(`SELECT ${columns},headers,body FROM events LIMIT 0`);
    const connection=db;
    const safe=<T>(action:()=>T):T=>{try{return action();}catch(error){if(error instanceof RecorderError)throw error;throw new RecorderError('DB_OPERATION_FAILED');}};
    return {
      insert(event:NewEvent):EventSummary{return safe(()=>{
        if(mode!=='write')throw new RecorderError('DB_READ_ONLY');
        const summary={id:randomUUID(),receivedAt:new Date().toISOString(),method:event.method,path:event.path,sizeBytes:event.body.byteLength};
        connection.exec('BEGIN IMMEDIATE');
        try{
          connection.prepare('INSERT INTO events(id,received_at,method,path,headers,body,size_bytes) VALUES(?,?,?,?,?,?,?)').run(summary.id,summary.receivedAt,event.method,event.path,JSON.stringify(selectHeaders(event.headers)),event.body,summary.sizeBytes);
          connection.exec('DELETE FROM events WHERE seq NOT IN (SELECT seq FROM events ORDER BY seq DESC LIMIT 1000)');
          connection.exec('COMMIT');return summary;
        }catch(error){connection.exec('ROLLBACK');throw error;}
      });},
      list(limit:number){return safe(()=>{
        if(!Number.isInteger(limit)||limit<1||limit>100)throw new RecorderError('LIMIT_INVALID');
        return connection.prepare(`SELECT ${columns} FROM events ORDER BY seq DESC LIMIT ?`).all(limit) as EventSummary[];
      });},
      get(id:string){return safe(()=>{
        const row=connection.prepare(`SELECT ${columns},headers,body FROM events WHERE id=?`).get(id);
        if(!row)return undefined;
        return {...row,headers:selectHeaders(JSON.parse(String(row.headers))),body:new Uint8Array(row.body as Uint8Array)} as RecordedEvent;
      });},
      close(){safe(()=>connection.close());}
    };
  }catch(error){try{db?.close();}catch{}if(error instanceof RecorderError)throw error;throw new RecorderError('DB_UNAVAILABLE');}
}

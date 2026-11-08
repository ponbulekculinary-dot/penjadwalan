import {readFileSync,readdirSync} from 'node:fs';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import worker from './worker.js';
export function d1(db){return {prepare(sql){let params=[];return {bind(...values){params=values;return this},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}}}}}};
export function migrate(db){for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+file,'utf8'))}
export function seed(db,password){const salt=randomBytes(16),hash=salt.toString('hex')+':'+pbkdf2Sync(password,salt,310000,32,'sha256').toString('hex');db.prepare('UPDATE users SET password_hash=?').run(hash)}
export function client(env){const cookies={};return async function call(user,path,data){const r=await worker.fetch(new Request('http://localhost'+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(cookies[user]?{Cookie:cookies[user]}:{})},body:data===undefined?undefined:JSON.stringify(data)}),env);const cookie=r.headers.get('set-cookie');if(cookie)cookies[user]=cookie.split(';')[0];return {status:r.status,body:await r.json()}}}


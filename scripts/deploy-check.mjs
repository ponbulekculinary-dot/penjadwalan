import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
if(config.d1_databases.some(db=>db.database_id==='00000000-0000-0000-0000-000000000000')){
 console.error('Deployment dibatalkan: database cloud belum dikonfigurasi. Buat D1 dan isi database_id terlebih dahulu.');process.exit(1);
}

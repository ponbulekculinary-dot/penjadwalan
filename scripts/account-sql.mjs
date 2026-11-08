// Generate a password hash for provisioning, without putting plaintext in SQL or Git.
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {MEMBER_ROLES} from '../scheduler.js';
const name=process.argv[2]?.toUpperCase(), output=process.argv[3],password=process.env.FRAME_ACCOUNT_PASSWORD;
if(!MEMBER_ROLES[name]||!output||!password||password.length<12||password==='Password123'){
  console.error('Use FRAME_ACCOUNT_PASSWORD (12+ characters), node scripts/account-sql.mjs USERNAME /private/path/account.sql');process.exit(1);
}
const salt=randomBytes(16),hash=salt.toString('hex')+':'+pbkdf2Sync(password,salt,310000,32,'sha256').toString('hex');
writeFileSync(output,`UPDATE users SET password_hash='${hash}' WHERE name='${name}';\nDELETE FROM sessions WHERE member='${name}';\n`,{mode:0o600});
console.log('SQL provisioning dibuat. Jalankan pada database yang dimaksud, lalu hapus file SQL.');

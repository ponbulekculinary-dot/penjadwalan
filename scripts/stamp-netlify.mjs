import {readFileSync, writeFileSync} from 'node:fs';
const marker = process.env.FRAME_BUILD_ID;
if (!/^[a-f0-9]{40}-\d+-\d+$/.test(marker || '')) throw new Error('Invalid FRAME_BUILD_ID');
const path = 'public/index.html';
const html = readFileSync(path, 'utf8');
if (!/<head(?:\s[^>]*)?>/i.test(html) || /name=["']frame-build["']/i.test(html)) throw new Error('Missing head or duplicate build marker');
writeFileSync(path, html.replace(/<head(?:\s[^>]*)?>/i, head => `${head}\n<meta name="frame-build" content="${marker}">`));

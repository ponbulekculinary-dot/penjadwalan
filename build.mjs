import {readFile, writeFile, mkdir} from 'node:fs/promises';
const template = await readFile(new URL('./ui/index.html', import.meta.url), 'utf8');
const scheduler = (await readFile(new URL('./scheduler.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
const demo = await readFile(new URL('./demo-runtime.js', import.meta.url), 'utf8');
if (!template.includes('<!-- DEMO_RUNTIME -->')) throw new Error('Demo marker missing.');
await mkdir(new URL('./public/', import.meta.url), {recursive: true});
await writeFile(new URL('./public/index.html', import.meta.url), template.replace('<!-- DEMO_RUNTIME -->', () => `<script>\n(() => {\n${scheduler}\n${demo}\n})();\n</script>`));

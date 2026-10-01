// Ghép src3d/shell.html + src3d/js/*.js thành một file HTML chạy được.
//   node src3d/build.mjs      → index.html (mở trực tiếp bằng trình duyệt)
//                              → dist/artifact.html (bản không có khung <html>, để xuất bản)
import {readFileSync, writeFileSync, readdirSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shell = readFileSync(join(here, 'shell.html'), 'utf8');
const files = readdirSync(join(here, 'js')).filter(f => f.endsWith('.js')).sort();
const js = files.map(f => `/* ===== ${f} ===== */\n` + readFileSync(join(here, 'js', f), 'utf8')).join('\n');
if (js.includes('</script')) throw new Error('JS must not contain a closing script tag');
const page = shell.replace('/*__JS__*/', () => js);

const head = '<!doctype html>\n<html lang="vi">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n';
writeFileSync(join(root, 'index.html'), head + page + '\n</html>\n');
mkdirSync(join(root, 'dist'), {recursive: true});
writeFileSync(join(root, 'dist', 'artifact.html'), page);
console.log(`built index.html (${(page.length / 1024).toFixed(0)} KB) from ${files.length} modules`);

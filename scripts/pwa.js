/**
 * Pós-processa `expo export --platform web` (pasta dist/) para virar web app instalável no iPhone:
 * manifesto, ícones, metatags iOS e service worker que guarda tudo para uso 100% offline.
 * Uso: node scripts/pwa.js dist
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dist = path.resolve(process.argv[2] || 'dist');
const icon = path.resolve(__dirname, '../assets/icon.png');
const NAME = 'Punch List Sucuriú';
const COLOR = '#00594C';

for (const s of [180, 192, 512]) {
  const out = path.join(dist, `icon-${s}.png`);
  try { execSync(`python3 -I -c "from PIL import Image; Image.open('${icon}').resize((${s},${s}), Image.LANCZOS).save('${out}')"`); }
  catch { fs.copyFileSync(icon, out); }
}

fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: NAME, short_name: 'Punch List', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
  background_color: '#F4F6F5', theme_color: COLOR, lang: 'pt-BR',
  icons: [192, 512].map((s) => ({ src: `icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
}, null, 2));

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const files = walk(dist).map((f) => path.relative(dist, f).split(path.sep).join('/')).filter((f) => f !== 'sw.js' && f !== 'metadata.json');
const version = require('crypto').createHash('sha1').update(files.join('|') + fs.readFileSync(path.join(dist, 'index.html'))).digest('hex').slice(0, 10);

fs.writeFileSync(path.join(dist, 'sw.js'), `const CACHE = 'punchlist-${version}';
const FILES = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Offline primeiro; navegação cai no index.html.
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then((r) => r || fetch(e.request).catch(() => caches.match('./'))));
});
`);

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<title>.*?<\/title>/, `<title>${NAME}</title>`)
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">')
  .replace('</head>', [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="icon-180.png">',
    `<meta name="theme-color" content="${COLOR}">`,
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="Punch List">',
    `<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));</script>`,
    '</head>'].join('\n'));
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log(`PWA pronto: ${files.length} arquivos em cache (versão ${version})`);

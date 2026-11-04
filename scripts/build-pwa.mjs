import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["expo", "export", "--platform", "web"],
  { stdio: "inherit" },
);
const root = path.resolve("dist");
const htmlPath = path.join(root, "index.html");
let html = await readFile(htmlPath, "utf8");
html = html
  .replace('<html lang="en">', '<html lang="ja">')
  .replace(
    /<title>.*?<\/title>/,
    "<title>Fuel Apply | 月末メーター記録</title>",
  );
html = html.replace(
  "</head>",
  `<meta name="theme-color" content="#245c44"><meta name="description" content="複数台の月末アワーメーターを、スマホからExcelにまとめて記録。"><link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="./icon-192.png"></head>`,
);
html = html.replace(
  "</body>",
  `<script>if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});});}</script></body>`,
);
await writeFile(htmlPath, html);
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    files.push(...(entry.isDirectory() ? await walk(full) : [full]));
  }
  return files;
}
// Cache the application shell only. OAuth redirects and cloud data never enter this cache.
const files = (await walk(root)).filter(
  (file) =>
    !/\.(map)$/.test(file) &&
    !["auth.html", "sw.js"].includes(path.basename(file)),
);
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile(file));
const version = hash.digest("hex").slice(0, 16);
const urls = files.map(
  (file) => "./" + path.relative(root, file).split(path.sep).join("/"),
);
await writeFile(
  path.join(root, "sw.js"),
  `
const CACHE = 'fuel-apply-${version}';
const ASSETS = ${JSON.stringify(urls)};
const BASE = new URL('./', self.location.href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fuel-apply-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname) || url.pathname.endsWith('/auth.html') || url.search || url.hash) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(new URL('./index.html', BASE).href)).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
`,
);
console.log(`PWA ready: dist/ (cache ${version})`);

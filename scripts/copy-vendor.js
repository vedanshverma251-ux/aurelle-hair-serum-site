// Copies Three.js into public/vendor so it is served as a static file (same-origin, CSP-friendly).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'three', 'build');
const dest = path.join(__dirname, '..', 'public', 'vendor', 'three');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) {
  const from = path.join(src, f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, f));
}
console.log('three copied to', dest);

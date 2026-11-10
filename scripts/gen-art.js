// Generates all original SVG artwork (no third-party assets). Run: npm run art
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'public', 'img');
fs.mkdirSync(out, { recursive: true });

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function strands({ w, h, n, color, opacity, amp, sw }) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x0 = rnd() * w;
    let x = x0;
    let d = `M${x0.toFixed(1)} -20`;
    const segs = 4;
    const step = (h + 40) / segs;
    for (let k = 1; k <= segs; k++) {
      const y = step * k - 20;
      const cx = x + (rnd() - 0.5) * amp * 2;
      const nx = x + (rnd() - 0.5) * amp;
      d += ` Q${cx.toFixed(1)} ${(y - step / 2).toFixed(1)} ${nx.toFixed(1)} ${y.toFixed(1)}`;
      x = nx;
    }
    s += `<path d="${d}" stroke="${color}" stroke-opacity="${(opacity * (0.4 + rnd() * 0.6)).toFixed(2)}" stroke-width="${(sw * (0.5 + rnd())).toFixed(2)}" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

const svg = (w, h, inner, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${defs}${inner}</svg>`;
const write = (name, content) => fs.writeFileSync(path.join(out, name), content);

// Hero: near-black with flowing gold strands
write(
  'hero-art.svg',
  svg(
    1600, 900,
    `<rect width="1600" height="900" fill="url(#g)"/>` +
      strands({ w: 1600, h: 900, n: 70, color: '#c9a24b', opacity: 0.22, amp: 220, sw: 1.4 }) +
      strands({ w: 1600, h: 900, n: 30, color: '#f1efe9', opacity: 0.08, amp: 300, sw: 0.8 }),
    `<defs><radialGradient id="g" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#1a1710"/><stop offset="1" stop-color="#070707"/></radialGradient></defs>`
  )
);

// Split panel art (left): deep emerald/teal waves
write(
  'panel-art.svg',
  svg(
    900, 760,
    `<rect width="900" height="760" fill="url(#g)"/>` +
      strands({ w: 900, h: 760, n: 60, color: '#e8c872', opacity: 0.3, amp: 160, sw: 1.6 }) +
      strands({ w: 900, h: 760, n: 40, color: '#7fe3d0', opacity: 0.22, amp: 200, sw: 1.2 }),
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f6b5e"/><stop offset="1" stop-color="#04201c"/></linearGradient></defs>`
  )
);

// Card art backgrounds
const cards = {
  amber: ['#f0a030', '#b5560f', '#ffe3a0'],
  gold: ['#d8b24a', '#7a5a12', '#fff3c4'],
  emerald: ['#1fa58a', '#0a4a40', '#b9f3e4'],
};
for (const [k, [a, b, c]] of Object.entries(cards)) {
  write(
    `card-${k}.svg`,
    svg(
      600, 420,
      `<rect width="600" height="420" fill="url(#g)"/>` + strands({ w: 600, h: 420, n: 46, color: c, opacity: 0.35, amp: 110, sw: 1.5 }),
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
    )
  );
}

// Faint botanical illustration for the cream section
let leaves = '';
for (let i = 0; i < 18; i++) {
  const x = rnd() * 1200;
  const y = rnd() * 500;
  const r = rnd() * 360;
  const s = 0.6 + rnd() * 1.1;
  leaves += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${r.toFixed(0)}) scale(${s.toFixed(2)})"><path d="M0 0 C40 -60 90 -60 130 0 C90 60 40 60 0 0Z" fill="#fff" fill-opacity="0.8" stroke="#d9d5ca" stroke-width="2"/><path d="M0 0 L130 0" stroke="#d9d5ca" stroke-width="2"/></g>`;
}
write('botanical.svg', svg(1200, 500, leaves));

// Static bottle (fallback + card art), three colourways
const bottleSvg = (glass, liquid, cap) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 280">
<defs>
<linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="${glass}" stop-opacity=".95"/><stop offset=".5" stop-color="${liquid}"/><stop offset="1" stop-color="${glass}" stop-opacity=".9"/></linearGradient>
<linearGradient id="cp" x1="0" x2="1"><stop offset="0" stop-color="${cap}"/><stop offset=".5" stop-color="#fff3c4"/><stop offset="1" stop-color="${cap}"/></linearGradient>
</defs>
<ellipse cx="60" cy="272" rx="40" ry="6" fill="#000" opacity=".25"/>
<rect x="46" y="14" width="28" height="30" rx="14" fill="#151515"/>
<rect x="40" y="40" width="40" height="26" rx="4" fill="url(#cp)"/>
<path d="M44 66h32v14c0 8 18 12 18 28v150c0 8-6 14-14 14H40c-8 0-14-6-14-14V108c0-16 18-20 18-28z" fill="url(#gl)"/>
<rect x="34" y="130" width="52" height="92" rx="3" fill="#f1efe9"/>
<text x="60" y="156" font-family="Georgia,serif" font-size="10" text-anchor="middle" fill="#7a5a12" letter-spacing="1.5">AURELLE</text>
<line x1="42" y1="164" x2="78" y2="164" stroke="#c9a24b"/>
<text x="60" y="180" font-family="Arial,sans-serif" font-size="6" text-anchor="middle" fill="#333" letter-spacing="1">HAIR SERUM</text>
<path d="M44 90c-6 14-8 40-8 60" stroke="#fff" stroke-opacity=".45" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
write('bottle-amber.svg', bottleSvg('#8a4b12', '#d98a2b', '#c9a24b'));
write('bottle-gold.svg', bottleSvg('#8f7220', '#e3c25a', '#c9a24b'));
write('bottle-emerald.svg', bottleSvg('#0b5a4c', '#1fa58a', '#c9a24b'));

// Before / after hair (abstract strands)
write(
  'hair-before.svg',
  svg(
    800, 520,
    `<rect width="800" height="520" fill="#2a2420"/>` + strands({ w: 800, h: 520, n: 120, color: '#8a6a45', opacity: 0.8, amp: 260, sw: 1.6 }),
  )
);
let smooth = '<rect width="800" height="520" fill="#2a2420"/>';
for (let i = 0; i < 90; i++) {
  const x = 20 + i * 8.5;
  smooth += `<path d="M${x} -10 C${x + 40} 150 ${x - 40} 330 ${x + 10} 530" stroke="#e3c25a" stroke-opacity="${(0.35 + (i % 5) * 0.1).toFixed(2)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
}
write('hair-after.svg', svg(800, 520, smooth));

write(
  'favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b0c"/><path d="M32 10c8 12 14 20 14 28a14 14 0 0 1-28 0c0-8 6-16 14-28z" fill="#c9a24b"/></svg>`
);

console.log('Art generated in', out);

import * as THREE from '/vendor/three/three.module.js';

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const THEMES = {
  amber: { glass: 0x8a4b12, liquid: 0xd98a2b, cap: 0xc9a24b },
  gold: { glass: 0x8f7220, liquid: 0xe3c25a, cap: 0xd8b24a },
  emerald: { glass: 0x0b5a4c, liquid: 0x1fa58a, cap: 0xc9a24b },
};

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f1efe9'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#c9a24b'; g.lineWidth = 6; g.strokeRect(20, 20, 472, 472);
  g.fillStyle = '#7a5a12'; g.textAlign = 'center';
  g.font = '700 74px Georgia,serif'; g.fillText('AURELLE', 256, 210);
  g.fillStyle = '#c9a24b'; g.fillRect(150, 240, 212, 4);
  g.fillStyle = '#333'; g.font = '600 34px Arial,sans-serif'; g.fillText('HAIR SERUM', 256, 300);
  g.font = '500 26px Arial,sans-serif'; g.fillStyle = '#777'; g.fillText('50 ml  ·  1.7 fl oz', 256, 350);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function initBottle(container) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.2, 13);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.prepend(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xfff0d0, 2.6); key.position.set(4, 6, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fe3d0, 2.0); rim.position.set(-5, 2, -4); scene.add(rim);
  const warm = new THREE.PointLight(0xffc860, 20, 30); warm.position.set(0, -2, 5); scene.add(warm);

  const group = new THREE.Group();
  scene.add(group);

  const profile = [[0, -2.2], [0.95, -2.2], [1.05, -2.1], [1.12, -1.9], [1.12, 1.0], [1.06, 1.3], [0.8, 1.5], [0.5, 1.62], [0.46, 1.78], [0.46, 1.9], [0, 1.9]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const lathe = new THREE.LatheGeometry(profile, 48);

  const glassMat = new THREE.MeshPhysicalMaterial({ color: THEMES.amber.glass, transparent: true, opacity: 0.6, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(lathe, glassMat);
  group.add(glass);

  const liquidMat = new THREE.MeshStandardMaterial({ color: THEMES.amber.liquid, roughness: 0.25, metalness: 0.1, emissive: THEMES.amber.liquid, emissiveIntensity: 0.18 });
  const liquid = new THREE.Mesh(lathe, liquidMat);
  liquid.scale.set(0.9, 0.84, 0.9); liquid.position.y = -0.18;
  group.add(liquid);

  const capMat = new THREE.MeshStandardMaterial({ color: THEMES.amber.cap, metalness: 0.75, roughness: 0.28, emissive: 0x3a2a05, emissiveIntensity: 0.4 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.55, 40), capMat);
  cap.position.y = 2.15; group.add(cap);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 24), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 }));
  bulb.scale.y = 1.5; bulb.position.y = 2.85; group.add(bulb);

  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(1.135, 1.135, 1.7, 48, 1, true, -Math.PI * 0.45, Math.PI * 0.9),
    new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.6, side: THREE.DoubleSide })
  );
  label.position.y = -0.55; label.rotation.y = Math.PI / 2 * 0; group.add(label);

  // Falling serum drop + ripple on the ground.
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xe3c25a, emissive: 0xc9a24b, emissiveIntensity: 0.5, roughness: 0.1 });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), dropMat);
  drop.scale.y = 1.4; scene.add(drop);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 48), new THREE.MeshBasicMaterial({ color: 0xe3c25a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const DROP_X = 1.9, TOP = 3.6, FLOOR = -2.3;

  function setTheme(name) {
    const t = THEMES[name];
    if (!t) return;
    glassMat.color.setHex(t.glass);
    liquidMat.color.setHex(t.liquid); liquidMat.emissive.setHex(t.liquid);
    capMat.color.setHex(t.cap);
    dropMat.color.setHex(t.liquid);
  }

  // Interaction: drag to spin (with inertia), mouse tilt, keyboard.
  let rotY = -0.5, vel = 0, dragging = false, lastX = 0, tiltX = 0, tiltY = 0, tx = 0, ty = 0;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; rotY += dx * 0.012; vel = dx * 0.012; });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  window.addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth - 0.5) * 0.3; ty = (e.clientY / innerHeight - 0.5) * 0.2; }, { passive: true });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { vel = -0.12; e.preventDefault(); }
    if (e.key === 'ArrowRight') { vel = 0.12; e.preventDefault(); }
  });

  function resize() {
    const w = container.clientWidth || 300, h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '200px' }).observe(container);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    if (!dragging) { rotY += vel; vel *= 0.94; if (!reduce && Math.abs(vel) < 0.002) rotY += 0.006; }
    tiltX += (ty - tiltX) * 0.06; tiltY += (tx - tiltY) * 0.06;
    group.rotation.y = rotY + tiltY + window.scrollY * 0.0012;
    group.rotation.x = tiltX;
    group.position.y = reduce ? 0 : Math.sin(t * 1.4) * 0.14;

    if (!reduce) {
      const p = (t % 3) / 3; // 0..1 per drop cycle
      if (p < 0.7) {
        const k = p / 0.7;
        drop.visible = true;
        drop.position.set(DROP_X, TOP - (TOP - FLOOR) * k * k, 0.2);
        ring.material.opacity = 0;
      } else {
        drop.visible = false;
        const r = (p - 0.7) / 0.3;
        ring.position.set(DROP_X, FLOOR, 0.2);
        ring.scale.setScalar(1 + r * 5);
        ring.material.opacity = 0.7 * (1 - r);
      }
    } else { drop.visible = false; }
    renderer.render(scene, camera);
  }
  frame();

  return { setTheme };
}

import { api, ApiError } from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (minor) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(minor / 100);
const ACCENTS = new Set(['amber', 'gold', 'emerald']);
const accent = (a) => (ACCENTS.has(a) ? a : 'amber');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { user: null, products: [], cart: {}, wish: new Set(), bottle: null };

/* ---------- toast ---------- */
let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- loading / skeleton / error states ---------- */
const skCard = () => `<div class="card sk-card" aria-hidden="true"><div class="sk sk--art"></div><div class="sk-card__body"><div class="sk sk--line sk--w60"></div><div class="sk sk--line"></div><div class="sk sk--line sk--w80"></div><div class="sk sk--btn"></div></div></div>`;
const skReview = () => `<div class="review" aria-hidden="true"><div class="sk sk--line sk--w60"></div><div class="sk sk--line"></div><div class="sk sk--line sk--w80"></div></div>`;
const skIng = () => `<div class="sk sk--ing" aria-hidden="true"></div>`;

function errorBox(err, retry) {
  const offline = err?.code === 'OFFLINE' || !navigator.onLine;
  const wrap = document.createElement('div');
  wrap.className = 'state-box';
  wrap.setAttribute('role', 'alert');
  wrap.innerHTML = `<div class="spinner" aria-hidden="true"></div>
    <h3>${offline ? "You're offline" : 'Having trouble connecting'}</h3>
    <p>${offline ? 'Check your connection. We will retry automatically when you are back.' : 'The server is taking a break. We retried a few times, you can try again.'}</p>
    <button type="button" class="btn btn--dark">Retry</button>`;
  $('button', wrap).addEventListener('click', retry);
  return wrap;
}

// Shows skeletons, loads data, and on failure shows an error box that also auto-retries when the connection returns.
async function loadInto(el, skeletonHtml, loader, render) {
  const run = async () => {
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = skeletonHtml;
    try {
      const data = await loader();
      el.innerHTML = '';
      render(data);
      el.removeAttribute('aria-busy');
      observeReveals(el);
    } catch (err) {
      el.innerHTML = '';
      el.append(errorBox(err, run));
      el.removeAttribute('aria-busy');
      const again = () => { window.removeEventListener('online', again); run(); };
      window.addEventListener('online', again, { once: true });
    }
  };
  return run();
}

/* ---------- cart ---------- */
function loadCart() {
  try { state.cart = JSON.parse(localStorage.getItem('aurelle_cart') || '{}') || {}; } catch { state.cart = {}; }
}
function saveCart() {
  try { localStorage.setItem('aurelle_cart', JSON.stringify(state.cart)); } catch { /* storage unavailable */ }
  renderCart();
}
const cartCount = () => Object.values(state.cart).reduce((a, b) => a + b, 0);

function addToCart(id, qty = 1) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  state.cart[id] = Math.min(10, (state.cart[id] || 0) + qty);
  saveCart();
  const b = $('#cartCount'); b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 250);
  toast(`${p.name} added to cart`);
}

function renderCart() {
  $('#cartCount').textContent = cartCount();
  const body = $('#cartItems');
  const ids = Object.keys(state.cart).filter((id) => state.products.some((p) => p.id === id));
  if (!ids.length) {
    body.innerHTML = '<p class="muted">Your cart is empty. Pick a serum you love.</p>';
    $('#cartTotal').textContent = money(0);
    $('#checkoutBtn').disabled = true;
    return;
  }
  $('#checkoutBtn').disabled = false;
  let total = 0;
  body.innerHTML = ids.map((id) => {
    const p = state.products.find((x) => x.id === id);
    const q = state.cart[id];
    total += p.priceMinor * q;
    return `<div class="line"><img src="/img/bottle-${accent(p.accent)}.svg" alt="" width="30" height="60"><div><b>${esc(p.name)}</b><span class="muted">${money(p.priceMinor)}</span><div class="qty"><button type="button" data-dec="${esc(id)}" aria-label="Decrease quantity">−</button><span>${q}</span><button type="button" data-inc="${esc(id)}" aria-label="Increase quantity">+</button></div></div><b>${money(p.priceMinor * q)}</b></div>`;
  }).join('');
  $('#cartTotal').textContent = money(total);
}

function openDrawer(open) {
  const d = $('#cartDrawer');
  d.classList.toggle('is-open', open);
  d.setAttribute('aria-hidden', String(!open));
  $('#scrim').hidden = !open;
  if (open) $('#cartClose').focus();
}

/* ---------- products ---------- */
function stars(n) { const r = Math.round(n); return '★'.repeat(r) + '☆'.repeat(5 - r); }

function cardHtml(p) {
  const a = accent(p.accent);
  return `<article class="card reveal" data-accent="${a}" data-id="${esc(p.id)}">
    <div class="card__art"><img class="card__bottle" src="/img/bottle-${a}.svg" alt="${esc(p.name)} hair serum bottle" loading="lazy" width="100" height="233"></div>
    <div class="card__body">
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.tagline)}</p>
      <p class="meta">${esc(p.sizeMl)} ml | ${esc(p.type)}${p.reviewCount ? ` | <span class="stars" aria-label="${p.avgRating} out of 5">${stars(p.avgRating)}</span>` : ''}</p>
      <p class="price">${money(p.priceMinor)}</p>
      <div class="card__actions">
        <button type="button" class="btn btn--dark magnetic" data-add="${esc(p.id)}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Sold out' : 'Add to cart'}</button>
        <button type="button" class="icon-btn" data-wish="${esc(p.id)}" aria-pressed="${state.wish.has(p.id)}" aria-label="Toggle ${esc(p.name)} in wishlist">♥</button>
      </div>
    </div></article>`;
}

function renderFeature(p) {
  const a = accent(p.accent);
  $('#featBlock').innerHTML = `<h2>${esc(p.name)} serum</h2><p>${esc(p.description)}</p>
    <div class="row"><button type="button" class="btn btn--white magnetic" data-add="${esc(p.id)}">Add to cart · ${money(p.priceMinor)}</button>
    <a class="link-arrow" href="#favorites">Explore the collection →</a></div>`;
  $('#stageFallback').src = `/img/bottle-${a}.svg`;
  state.bottle?.setTheme(a);
  state.featured = p;
}

async function loadProducts() {
  await loadInto($('#productGrid'), skCard().repeat(3), async () => (await api('/products')).products, (products) => {
    state.products = products;
    if (!products.length) {
      $('#productGrid').innerHTML = '<div class="state-box"><h3>Serums coming soon</h3><p>Our catalogue is being restocked. Please check back shortly.</p></div>';
      $('#featBlock').innerHTML = '<h2>Coming soon</h2><p>New serums are on their way.</p>';
      renderCart();
      return;
    }
    $('#productGrid').innerHTML = products.map(cardHtml).join('');
    renderFeature(products[0]);
    renderCart();
    const sel = $('#reviewProduct');
    sel.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    bindTilt();
    bindMagnetic();
  });
}

function bindTilt() {
  if (reduceMotion) return;
  $$('.card').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      c.style.transform = `perspective(800px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-4px)`;
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
    c.addEventListener('pointerenter', () => state.bottle?.setTheme(accent(c.dataset.accent)));
  });
}

/* ---------- ingredients / reviews ---------- */
async function loadIngredients() {
  await loadInto($('#ingredientGrid'), skIng().repeat(6), async () => (await api('/ingredients')).ingredients, (list) => {
    $('#ingredientGrid').innerHTML = list.map((i) => `<button type="button" class="flip reveal" aria-pressed="false"><span class="flip__in"><span class="flip__f"><span aria-hidden="true">${esc(i.icon)}</span><b>${esc(i.name)}</b></span><span class="flip__b">${esc(i.benefit)}</span></span></button>`).join('');
    $$('.flip').forEach((f) => f.addEventListener('click', () => { const on = f.classList.toggle('is-on'); f.setAttribute('aria-pressed', String(on)); }));
  });
}

async function loadReviews() {
  await loadInto($('#reviewGrid'), skReview().repeat(3), async () => (await api('/reviews?limit=6')).reviews, (list) => {
    $('#reviewGrid').innerHTML = list.map((r) => `<article class="review reveal"><span class="stars" aria-label="${r.rating} out of 5">${stars(r.rating)}</span><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><small>${esc(r.authorName)} on ${esc(r.product)}</small></article>`).join('') || '<p class="muted">No reviews yet. Be the first!</p>';
  });
}

/* ---------- auth ---------- */
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === 'register';
  $('#authTitle').textContent = reg ? 'Create account' : 'Sign in';
  $('#authSubmit').textContent = reg ? 'Create account' : 'Sign in';
  $('#authToggle').textContent = reg ? 'Have an account? Sign in' : 'New here? Create an account';
  $('#nameRow').hidden = !reg;
  $('#pwHint').hidden = !reg;
  $('#authForm [name=password]').autocomplete = reg ? 'new-password' : 'current-password';
  $('#authForm .form-msg').textContent = '';
}

function applyUser(user) {
  state.user = user;
  $('#authBtn').textContent = user ? 'Sign out' : 'Sign in';
  $('#reviewForm').hidden = !user;
  $('#reviewHint').hidden = !!user;
}

async function loadWishlist() {
  if (!state.user) { state.wish = new Set(); return; }
  try { state.wish = new Set((await api('/wishlist')).productIds); } catch { /* non-critical */ }
  $$('[data-wish]').forEach((b) => b.setAttribute('aria-pressed', String(state.wish.has(b.dataset.wish))));
}

const hadSession = () => { try { return localStorage.getItem('aurelle_session') === '1'; } catch { return false; } };
const flagSession = (on) => { try { if (on) localStorage.setItem('aurelle_session', '1'); else localStorage.removeItem('aurelle_session'); } catch { /* ignore */ } };

async function initSession() {
  try {
    let { user } = await api('/auth/me', { retries: 1 });
    if (!user && hadSession()) {
      try { ({ user } = await api('/auth/refresh', { method: 'POST', retries: 0 })); } catch { user = null; }
      if (!user) flagSession(false);
    }
    applyUser(user);
    await loadWishlist();
  } catch { applyUser(null); }
}

/* ---------- forms ---------- */
const msg = (form, text, ok = false) => { const m = $('.form-msg', form); m.textContent = text; m.classList.toggle('ok', ok); };
const fieldErrors = (e) => (e instanceof ApiError ? e.message : 'Something went wrong');
async function submitting(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

function bindForms() {
  $('#authBtn').addEventListener('click', async () => {
    if (state.user) {
      try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      applyUser(null); flagSession(false); state.wish = new Set();
      $$('[data-wish]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      toast('Signed out');
    } else { setAuthMode('login'); $('#authDialog').showModal(); }
  });
  $('#authToggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  $('#authCancel').addEventListener('click', () => $('#authDialog').close());
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; const fd = Object.fromEntries(new FormData(f));
    if (!f.checkValidity()) { msg(f, 'Please fill in all fields correctly.'); return; }
    await submitting($('#authSubmit'), async () => {
      try {
        const body = authMode === 'register' ? { name: fd.name, email: fd.email, password: fd.password } : { email: fd.email, password: fd.password };
        const { user } = await api(authMode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body });
        applyUser(user); flagSession(true); f.reset(); $('#authDialog').close(); toast(`Welcome, ${user.name}!`); loadWishlist();
      } catch (err) { msg(f, fieldErrors(err)); }
    });
  });

  $('#reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; const fd = Object.fromEntries(new FormData(f));
    await submitting($('button', f), async () => {
      try {
        await api('/reviews', { method: 'POST', body: { productId: fd.productId, rating: Number(fd.rating), title: fd.title, body: fd.body } });
        msg(f, 'Thanks for your review!', true); f.reset(); loadReviews();
      } catch (err) { msg(f, fieldErrors(err)); }
    });
  });

  $('#newsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; const email = $('#newsEmail').value;
    if (!$('#newsEmail').checkValidity()) { msg(f, 'Enter a valid email.'); return; }
    await submitting($('button', f), async () => {
      try { await api('/newsletter', { method: 'POST', body: { email } }); msg(f, "You're in! Watch your inbox.", true); f.reset(); }
      catch (err) { msg(f, fieldErrors(err)); }
    });
  });

  $('#storeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('#pin').value.trim();
    const box = $('#storeResults');
    if (!/^\d{6}$/.test(pin)) { box.innerHTML = '<p class="muted-d">Enter a valid 6-digit pincode.</p>'; return; }
    await loadInto(box, '<div class="sk sk--store" aria-hidden="true"></div>', () => api('/stores?pincode=' + encodeURIComponent(pin)), (r) => {
      const head = r.match === 'exact' ? 'Stores at your pincode' : r.match === 'area' ? 'Stores in your area' : 'No store near you yet. Here are our flagships, or get it delivered:';
      box.innerHTML = `<p class="muted-d">${head}</p>` + r.stores.map((s) => `<div class="store"><b>${esc(s.name)}</b><span>${esc(s.address)}, ${esc(s.city)} ${esc(s.pincode)}</span></div>`).join('');
    });
  });

  // checkout
  $('#cartBtn').addEventListener('click', () => openDrawer(true));
  $('#cartClose').addEventListener('click', () => openDrawer(false));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  $('#cartItems').addEventListener('click', (e) => {
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    if (inc) state.cart[inc.dataset.inc] = Math.min(10, (state.cart[inc.dataset.inc] || 0) + 1);
    if (dec) { const id = dec.dataset.dec; state.cart[id] = (state.cart[id] || 1) - 1; if (state.cart[id] <= 0) delete state.cart[id]; }
    if (inc || dec) saveCart();
  });
  $('#checkoutBtn').addEventListener('click', () => { openDrawer(false); $('#checkoutDialog').showModal(); });
  $('#coCancel').addEventListener('click', () => $('#checkoutDialog').close());
  $('#checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.checkValidity()) { msg(f, 'Please check your details (10-digit mobile, 6-digit pincode).'); return; }
    const fd = Object.fromEntries(new FormData(f));
    const items = Object.entries(state.cart).map(([productId, quantity]) => ({ productId, quantity }));
    await submitting($('#coSubmit'), async () => {
      try {
        const r = await api('/orders', { method: 'POST', body: { email: fd.email, items, shipping: { name: fd.name, phone: fd.phone, line1: fd.line1, city: fd.city, pincode: fd.pincode } } });
        state.cart = {}; saveCart();
        $('#checkoutDialog').close(); f.reset();
        if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
        toast(r.message || 'Order placed!');
      } catch (err) { msg(f, fieldErrors(err)); }
    });
  });

  // wishlist
  $('#wishBtn').addEventListener('click', () => {
    if (!state.user) { toast('Sign in to use your wishlist'); setAuthMode('login'); $('#authDialog').showModal(); return; }
    const items = state.products.filter((p) => state.wish.has(p.id));
    $('#wishList').innerHTML = items.length ? items.map((p) => `<div class="line"><img src="/img/bottle-${accent(p.accent)}.svg" alt="" width="30" height="60"><div><b>${esc(p.name)}</b><span class="muted">${money(p.priceMinor)}</span></div><button class="btn btn--dark" type="button" data-add="${esc(p.id)}">Add</button></div>`).join('') : '<p class="muted">Nothing saved yet. Tap ♥ on a serum.</p>';
    $('#wishDialog').showModal();
  });
  $('#wishClose').addEventListener('click', () => $('#wishDialog').close());
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

/* ---------- global click delegation: add-to-cart, wishlist ---------- */
document.addEventListener('click', async (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { addToCart(add.dataset.add); return; }
  const w = e.target.closest('[data-wish]');
  if (w) {
    if (!state.user) { toast('Sign in to save favourites'); setAuthMode('login'); $('#authDialog').showModal(); return; }
    const id = w.dataset.wish; const on = state.wish.has(id);
    try {
      await api(`/wishlist/${encodeURIComponent(id)}`, { method: on ? 'DELETE' : 'POST' });
      if (on) state.wish.delete(id); else state.wish.add(id);
      w.setAttribute('aria-pressed', String(!on));
    } catch (err) { toast(fieldErrors(err)); }
  }
});

/* ---------- micro-interactions ---------- */
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(); const size = Math.max(r.width, r.height);
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.width = s.style.height = `${size}px`;
  s.style.left = `${e.clientX - r.left - size / 2}px`; s.style.top = `${e.clientY - r.top - size / 2}px`;
  b.append(s); setTimeout(() => s.remove(), 600);
  b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce');
});

function bindMagnetic() {
  if (reduceMotion) return;
  $$('.magnetic').forEach((el) => {
    if (el.dataset.mag) return; el.dataset.mag = '1';
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px,${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

let io;
function observeReveals(root = document) {
  io ||= new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
  $$('.reveal:not(.in)', root).forEach((el) => io.observe(el));
}

function bindScroll() {
  const header = $('#siteHeader'); const sticky = $('#stickyBuy');
  const parallax = $$('[data-parallax]');
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    header.classList.toggle('is-solid', y > 60);
    sticky.hidden = y < 700;
    if (!reduceMotion) parallax.forEach((el) => { el.style.transform = `translate3d(0,${(y * Number(el.dataset.parallax)).toFixed(1)}px,0)`; });
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
  sticky.addEventListener('click', () => { if (state.featured) addToCart(state.featured.id); openDrawer(true); });
}

function bindBeforeAfter() {
  const box = $('#baBox'); const range = $('#baRange');
  range.addEventListener('input', () => box.style.setProperty('--pos', `${range.value}%`));
}

function bindNetwork() {
  const banner = $('#netBanner');
  const sync = () => { banner.hidden = navigator.onLine; };
  window.addEventListener('online', () => { sync(); toast('Back online'); });
  window.addEventListener('offline', sync);
  sync();
}

/* ---------- 3D (lazy, with WebGL fallback) ---------- */
async function initStage() {
  const stage = $('#bottleStage'); const fallback = $('#stageFallback');
  const showFallback = () => { fallback.hidden = false; $('.stage__hint', stage)?.remove(); };
  try {
    const mod = await import('./bottle3d.js');
    if (!mod.webglSupported()) { showFallback(); return; }
    state.bottle = mod.initBottle(stage);
    if (state.featured) state.bottle.setTheme(accent(state.featured.accent));
  } catch { showFallback(); }
}

/* ---------- boot ---------- */
function stageLazy() {
  const stage = $('#bottleStage');
  const io2 = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io2.disconnect(); initStage(); } }, { rootMargin: '600px' });
  io2.observe(stage);
}

function handleOrderQuery() {
  const q = new URLSearchParams(location.search).get('order');
  if (q === 'success') toast('Payment received. Thank you!');
  if (q === 'cancelled') toast('Payment cancelled. Your items are saved in the cart.');
  if (q) history.replaceState(null, '', location.pathname);
}

async function boot() {
  loadCart();
  bindNetwork(); bindForms(); bindScroll(); bindBeforeAfter(); bindMagnetic(); observeReveals(); stageLazy();
  const done = () => $('#pageLoader').classList.add('is-done');
  const safety = setTimeout(done, 4000);
  await Promise.allSettled([initSession(), loadProducts(), loadIngredients(), loadReviews()]);
  clearTimeout(safety); done();
  await loadWishlist();
  handleOrderQuery();
}
boot();

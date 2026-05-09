/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║           VP AUREX — Central Application Orchestrator         ║
 * ║           aurex-app.js  ·  v2.0  ·  Production Ready          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * USAGE: Add one line before </body> in every HTML page:
 *   <script src="aurex-app.js"></script>
 *
 * The script auto-detects the current page and initialises the
 * correct modules. All shared utilities (cart, auth, toast,
 * theme, search, animations) run on every page.
 *
 * MODULE MAP
 * ──────────
 *  Core        — init, page detection, event bus, security utils
 *  Auth        — Firebase session, sign-in guard, profile sync
 *  Cart        — add/remove/update, localStorage persistence, badge
 *  Toast       — centralised notification system
 *  Theme       — dark/light mode, persistence
 *  Nav         — mobile menu, sticky header, smooth scroll, breadcrumb
 *  Search      — live search overlay, filtering, keyboard nav
 *  Animations  — IntersectionObserver reveals, parallax, counters
 *  Index       — hero, featured products, testimonials
 *  Product     — gallery, variant picker, quantity, wishlist, reviews
 *  Shop        — filter panel, sort, infinite scroll / pagination
 *  CartPage    — line items, quantities, coupon, order summary
 *  Checkout    — multi-step form, validation, order submission
 *  Profile     — order history, address book, preferences
 *  Wishlist    — toggle, sync with Firebase for auth'd users
 */

'use strict';

/* ════════════════════════════════════════════════════════════════
   §0  NAMESPACE & CONFIGURATION
════════════════════════════════════════════════════════════════ */
window.AUREX = window.AUREX || {};

const AurexConfig = {
  firebase: {
    apiKey:            "AIzaSyDtwC9VQ1cT2-HgvdYjfgu573qUHxAPPQQ",
    authDomain:        "vpaurex-42eef.firebaseapp.com",
    databaseURL:       "https://vpaurex-42eef-default-rtdb.firebaseio.com",
    projectId:         "vpaurex-42eef",
    storageBucket:     "vpaurex-42eef.firebasestorage.app",
    messagingSenderId: "575670373529",
    appId:             "1:575670373529:web:f86a21ed8f361d1c8cbc08"
  },
  cart: {
    storageKey:   'aurex_cart',
    maxQty:       99,
    couponCodes:  { 'AUREX10': 10, 'LUXURY20': 20, 'FIRST15': 15 }
  },
  theme: {
    storageKey: 'aurex_theme',
    default:    'dark'
  },
  toast: {
    duration:  4000,
    maxStack:  4
  },
  search: {
    minChars:  2,
    debounce:  280
  },
  security: {
    loginRateLimit: 5,
    lockDuration:   30000,
    csrfKey:        'aurex_csrf'
  },
  pages: {
    index:    ['index.html', '/', ''],
    product:  ['product.html', 'product'],
    shop:     ['shop.html', 'products.html', 'shop'],
    cart:     ['cart.html', 'cart'],
    checkout: ['checkout.html', 'checkout'],
    profile:  ['profile.html', 'account.html', 'profile', 'account'],
    wishlist: ['wishlist.html', 'wishlist'],
    login:    ['login.html', 'login'],
    orders:   ['orders.html', 'orders']
  }
};

/* ════════════════════════════════════════════════════════════════
   §1  CORE — UTILITIES, EVENT BUS, SECURITY
════════════════════════════════════════════════════════════════ */
const Core = (() => {
  /* ── Mini Event Bus ── */
  const _events = {};

  function on(event, fn) {
    (_events[event] = _events[event] || []).push(fn);
    return () => off(event, fn);
  }
  function off(event, fn) {
    _events[event] = (_events[event] || []).filter(f => f !== fn);
  }
  function emit(event, data) {
    (_events[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.warn('[AUREX Bus]', e); } });
  }

  /* ── Page Detection ── */
  function currentPage() {
    const path = window.location.pathname.toLowerCase();
    const file = path.split('/').pop() || 'index.html';
    for (const [name, variants] of Object.entries(AurexConfig.pages)) {
      if (variants.some(v => file.includes(v) || path.endsWith(v))) return name;
    }
    return 'index';
  }

  /* ── DOM Helpers ── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ── Debounce / Throttle ── */
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function throttle(fn, ms) {
    let last = 0;
    return (...args) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } };
  }

  /* ── XSS Sanitiser ── */
  function sanitize(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  }

  /* ── Safe HTML template tag ── */
  function html(strings, ...vals) {
    return strings.reduce((out, str, i) => out + str + (vals[i] !== undefined ? sanitize(vals[i]) : ''), '');
  }

  /* ── Currency Format ── */
  function formatINR(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /* ── CSRF Token ── */
  function getCSRF() {
    let token = sessionStorage.getItem(AurexConfig.security.csrfKey);
    if (!token) {
      token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      sessionStorage.setItem(AurexConfig.security.csrfKey, token);
    }
    return token;
  }

  /* ── Rate Limiter (per key) ── */
  const _rateLimits = {};
  function rateLimit(key, max = 5, windowMs = 30000) {
    const now = Date.now();
    const rl = _rateLimits[key] = _rateLimits[key] || { count: 0, reset: now + windowMs };
    if (now > rl.reset) { rl.count = 0; rl.reset = now + windowMs; }
    if (rl.count >= max) return { blocked: true, remaining: 0, resetIn: Math.ceil((rl.reset - now) / 1000) };
    rl.count++;
    return { blocked: false, remaining: max - rl.count };
  }

  /* ── Deep Clone ── */
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* ── URL Params ── */
  function params() { return Object.fromEntries(new URLSearchParams(window.location.search)); }
  function setParam(key, val) {
    const url = new URL(window.location);
    val ? url.searchParams.set(key, val) : url.searchParams.delete(key);
    history.replaceState({}, '', url);
  }

  /* ── Storage helpers (with fallback) ── */
  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function retrieve(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function drop(key) { try { localStorage.removeItem(key); } catch {} }

  /* ── Scroll Lock ── */
  function lockScroll()   { document.body.style.overflow = 'hidden'; }
  function unlockScroll() { document.body.style.overflow = ''; }

  /* ── Generate order ID ── */
  function genOrderId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `AX-${ts}-${rand}`;
  }

  return { on, off, emit, currentPage, $, $$, ready, debounce, throttle,
           sanitize, html, formatINR, getCSRF, rateLimit, clone, params,
           setParam, store, retrieve, drop, lockScroll, unlockScroll, genOrderId };
})();

/* ════════════════════════════════════════════════════════════════
   §2  FIREBASE MANAGER
════════════════════════════════════════════════════════════════ */
const FirebaseManager = (() => {
  let _db = null, _auth = null, _initialised = false;

  function init() {
    if (_initialised) return;
    try {
      // Reuse existing firebase app if already initialised
      const app = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(AurexConfig.firebase);
      _db   = firebase.database(app);
      _auth = firebase.auth(app);
      _initialised = true;
    } catch(e) {
      console.warn('[AUREX Firebase] Init failed — Firebase SDK not loaded?', e.message);
    }
  }

  function auth()     { init(); return _auth; }
  function database() { init(); return _db; }

  function ref(path)  { init(); return _db?.ref(path); }

  async function get(path) {
    try {
      const snap = await ref(path).once('value');
      return snap.val();
    } catch(e) { console.warn('[AUREX DB get]', e); return null; }
  }

  async function set(path, data) {
    try { await ref(path).set(data); return true; }
    catch(e) { console.warn('[AUREX DB set]', e); return false; }
  }

  async function update(path, data) {
    try { await ref(path).update(data); return true; }
    catch(e) { console.warn('[AUREX DB update]', e); return false; }
  }

  async function push(path, data) {
    try { const r = await ref(path).push(data); return r.key; }
    catch(e) { console.warn('[AUREX DB push]', e); return null; }
  }

  async function remove(path) {
    try { await ref(path).remove(); return true; }
    catch(e) { console.warn('[AUREX DB remove]', e); return false; }
  }

  function onValue(path, callback) {
    const r = ref(path);
    if (!r) return () => {};
    const handler = snap => callback(snap.val());
    r.on('value', handler);
    return () => r.off('value', handler);
  }

  return { init, auth, database, ref, get, set, update, push, remove, onValue };
})();

/* ════════════════════════════════════════════════════════════════
   §3  AUTH MODULE
════════════════════════════════════════════════════════════════ */
const Auth = (() => {
  let _user = null;

  function init() {
    const auth = FirebaseManager.auth();
    if (!auth) return;
    auth.onAuthStateChanged(user => {
      _user = user;
      Core.emit('auth:change', user);
      _syncUI(user);
    });
  }

  function _syncUI(user) {
    /* Update all nav avatars / login links across every page */
    const avatarEls   = Core.$$('[data-auth-avatar]');
    const loginLinks  = Core.$$('[data-auth-login]');
    const logoutLinks = Core.$$('[data-auth-logout]');
    const authShown   = Core.$$('[data-auth-show]');   // show when logged in
    const authHidden  = Core.$$('[data-auth-hide]');   // hide when logged in
    const nameEls     = Core.$$('[data-auth-name]');

    if (user) {
      const name    = user.displayName || user.email?.split('@')[0] || 'Member';
      const initial = name[0].toUpperCase();
      avatarEls.forEach(el => {
        if (user.photoURL) {
          el.innerHTML = `<img src="${user.photoURL}" alt="${Core.sanitize(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
          el.textContent = initial;
        }
      });
      nameEls.forEach(el => { el.textContent = name; });
      authShown.forEach(el  => { el.style.display = ''; });
      authHidden.forEach(el => { el.style.display = 'none'; });
    } else {
      avatarEls.forEach(el  => { el.textContent = 'S'; });
      nameEls.forEach(el    => { el.textContent = 'Sign In'; });
      authShown.forEach(el  => { el.style.display = 'none'; });
      authHidden.forEach(el => { el.style.display = ''; });
    }
  }

  function currentUser()  { return _user; }
  function isLoggedIn()   { return !!_user; }

  async function signOut() {
    const auth = FirebaseManager.auth();
    if (!auth) return;
    await auth.signOut();
    Toast.show('Signed out successfully.', 'info');
  }

  /* Guard: redirect to login if not authenticated */
  function requireAuth(redirectTo = 'login.html') {
    const auth = FirebaseManager.auth();
    if (!auth) return;
    auth.onAuthStateChanged(user => {
      if (!user) window.location.href = redirectTo;
    });
  }

  /* Attach logout to any [data-auth-logout] element */
  function _bindLogout() {
    Core.$$('[data-auth-logout]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); signOut(); });
    });
  }

  /* Sync wishlist from local → Firebase on sign-in */
  async function _syncWishlistOnLogin(user) {
    const local = Core.retrieve('aurex_wishlist', []);
    if (!local.length || !user) return;
    for (const id of local) {
      await FirebaseManager.update(`users/${user.uid}/wishlist/${id}`, { id, addedAt: Date.now() });
    }
  }

  Core.on('auth:change', user => {
    if (user) _syncWishlistOnLogin(user);
  });

  return { init, currentUser, isLoggedIn, signOut, requireAuth, _bindLogout };
})();

/* ════════════════════════════════════════════════════════════════
   §4  TOAST MODULE
════════════════════════════════════════════════════════════════ */
const Toast = (() => {
  let _container = null;

  function _ensureContainer() {
    if (_container) return;
    _container = document.createElement('div');
    _container.id = 'aurex-toast-root';
    _container.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:99999;
      display:flex;flex-direction:column;gap:10px;
      max-width:320px;pointer-events:none;
    `;
    document.body.appendChild(_container);
  }

  function show(message, type = 'info', duration = AurexConfig.toast.duration) {
    _ensureContainer();

    /* Respect max stack */
    while (_container.children.length >= AurexConfig.toast.maxStack) {
      _container.firstChild?.remove();
    }

    const icons = { ok: '✓', err: '✕', info: '◆', warn: '⚠' };
    const colours = {
      ok:   { bg: 'rgba(80,200,130,.12)', border: 'rgba(80,200,130,.25)', icon: '#50c882', label: '#50c882' },
      err:  { bg: 'rgba(210,80,80,.12)',  border: 'rgba(210,80,80,.25)',  icon: '#d07070', label: '#d07070' },
      info: { bg: 'rgba(200,169,110,.10)',border: 'rgba(200,169,110,.22)',icon: '#c8a96e', label: '#c8a96e' },
      warn: { bg: 'rgba(255,179,0,.10)',  border: 'rgba(255,179,0,.22)',  icon: '#d4a800', label: '#d4a800' }
    };
    const c = colours[type] || colours.info;

    const el = document.createElement('div');
    el.style.cssText = `
      display:flex;align-items:flex-start;gap:10px;
      background:#111009;border:1px solid ${c.border};
      border-radius:10px;padding:13px 16px;
      box-shadow:0 8px 40px rgba(0,0,0,.6);
      pointer-events:all;
      transform:translateX(30px);opacity:0;
      transition:transform .35s cubic-bezier(.34,1.56,.64,1),opacity .35s ease;
      max-width:100%;
    `;

    el.innerHTML = `
      <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;
           justify-content:center;font-size:11px;flex-shrink:0;margin-top:1px;
           background:${c.bg};color:${c.icon};border:1px solid ${c.border}">
        ${icons[type] || icons.info}
      </div>
      <div>
        <div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;
             color:${c.label};margin-bottom:2px;font-family:'Outfit',sans-serif">
          ${type === 'ok' ? 'Success' : type === 'err' ? 'Error' : type === 'warn' ? 'Warning' : 'Notice'}
        </div>
        <div style="font-size:12px;color:#a09880;line-height:1.4;font-family:'Outfit',sans-serif">
          ${Core.sanitize(message)}
        </div>
      </div>
    `;

    _container.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transform = 'translateX(0)';
        el.style.opacity   = '1';
      });
    });

    setTimeout(() => {
      el.style.transform = 'translateX(30px)';
      el.style.opacity   = '0';
      setTimeout(() => el.remove(), 360);
    }, duration);
  }

  function ok(msg, dur)   { show(msg, 'ok',   dur); }
  function err(msg, dur)  { show(msg, 'err',  dur); }
  function warn(msg, dur) { show(msg, 'warn', dur); }
  function info(msg, dur) { show(msg, 'info', dur); }

  return { show, ok, err, warn, info };
})();

/* ════════════════════════════════════════════════════════════════
   §5  THEME MODULE
════════════════════════════════════════════════════════════════ */
const Theme = (() => {
  function init() {
    const saved = Core.retrieve(AurexConfig.theme.storageKey, AurexConfig.theme.default);
    _apply(saved);

    Core.$$('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', toggle);
    });
  }

  function _apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Core.store(AurexConfig.theme.storageKey, theme);
    Core.$$('[data-theme-toggle]').forEach(btn => {
      btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    });
    Core.emit('theme:change', theme);
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    _apply(current === 'dark' ? 'light' : 'dark');
  }

  function get() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  return { init, toggle, get };
})();

/* ════════════════════════════════════════════════════════════════
   §6  CART MODULE  (localStorage — syncs badge across pages)
════════════════════════════════════════════════════════════════ */
const Cart = (() => {
  let _items = [];

  function _load()  { _items = Core.retrieve(AurexConfig.cart.storageKey, []); }
  function _save()  { Core.store(AurexConfig.cart.storageKey, _items); _updateBadges(); Core.emit('cart:change', _items); }

  function _updateBadges() {
    const count = totalCount();
    Core.$$('[data-cart-badge]').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
    Core.$$('[data-cart-count]').forEach(el => { el.textContent = count; });
  }

  function init() {
    _load();
    _updateBadges();

    /* Delegated: any [data-add-to-cart] button */
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-add-to-cart]');
      if (btn) {
        e.preventDefault();
        const id       = btn.dataset.productId   || btn.closest('[data-product-id]')?.dataset.productId;
        const name     = btn.dataset.productName || btn.closest('[data-product-name]')?.dataset.productName || 'Product';
        const price    = Number(btn.dataset.productPrice || btn.closest('[data-product-price]')?.dataset.productPrice || 0);
        const image    = btn.dataset.productImage || btn.closest('[data-product-image]')?.dataset.productImage || '';
        const qty      = Number(btn.dataset.qty || 1);
        if (id) addItem({ id, name, price, image, qty });
      }

      /* Remove item */
      const removeBtn = e.target.closest('[data-remove-cart-item]');
      if (removeBtn) {
        removeItem(removeBtn.dataset.removeCartItem);
      }
    });

    /* Quantity change inputs */
    document.addEventListener('change', e => {
      const inp = e.target.closest('[data-cart-qty-input]');
      if (inp) updateQty(inp.dataset.cartQtyInput, Number(inp.value));
    });
  }

  /* ── Public API ── */
  function addItem(product) {
    _load();
    const { id, name, price, image, qty = 1 } = product;
    const existing = _items.find(i => i.id === id);
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, AurexConfig.cart.maxQty);
    } else {
      _items.push({ id, name, price, image: image || '', qty, addedAt: Date.now() });
    }
    _save();
    Toast.ok(`${Core.sanitize(name)} added to cart.`);
    _animateCartIcon();
    return _items;
  }

  function removeItem(id) {
    _load();
    const before = _items.length;
    _items = _items.filter(i => i.id !== id);
    if (_items.length !== before) { _save(); Toast.info('Item removed from cart.'); }
    return _items;
  }

  function updateQty(id, qty) {
    _load();
    const item = _items.find(i => i.id === id);
    if (!item) return;
    if (qty <= 0) { removeItem(id); return; }
    item.qty = Math.min(qty, AurexConfig.cart.maxQty);
    _save();
    return _items;
  }

  function clear() { _items = []; _save(); }

  function items()      { _load(); return Core.clone(_items); }
  function totalCount() { _load(); return _items.reduce((s, i) => s + i.qty, 0); }
  function subtotal()   { _load(); return _items.reduce((s, i) => s + i.price * i.qty, 0); }
  function isEmpty()    { _load(); return _items.length === 0; }

  function applyCoupon(code) {
    const discount = AurexConfig.cart.couponCodes[code?.toUpperCase()];
    if (!discount) return { valid: false, message: 'Invalid coupon code.' };
    Core.store('aurex_coupon', { code: code.toUpperCase(), discount });
    return { valid: true, discount, message: `${discount}% discount applied!` };
  }

  function getCoupon() { return Core.retrieve('aurex_coupon', null); }
  function clearCoupon() { Core.drop('aurex_coupon'); }

  function discountedTotal() {
    const sub     = subtotal();
    const coupon  = getCoupon();
    return coupon ? sub * (1 - coupon.discount / 100) : sub;
  }

  function _animateCartIcon() {
    Core.$$('[data-cart-icon]').forEach(el => {
      el.style.transform = 'scale(1.3)';
      el.style.transition = 'transform .2s cubic-bezier(.34,1.56,.64,1)';
      setTimeout(() => { el.style.transform = ''; }, 250);
    });
  }

  return { init, addItem, removeItem, updateQty, clear, items, totalCount,
           subtotal, isEmpty, applyCoupon, getCoupon, clearCoupon, discountedTotal };
})();

/* ════════════════════════════════════════════════════════════════
   §7  WISHLIST MODULE
════════════════════════════════════════════════════════════════ */
const Wishlist = (() => {
  const KEY = 'aurex_wishlist';

  function _load()  { return Core.retrieve(KEY, []); }
  function _save(l) { Core.store(KEY, l); _updateButtons(l); Core.emit('wishlist:change', l); }

  function _updateButtons(list) {
    Core.$$('[data-wishlist-toggle]').forEach(btn => {
      const id = btn.dataset.wishlistToggle;
      const active = list.includes(id);
      btn.classList.toggle('is-wishlisted', active);
      btn.setAttribute('aria-pressed', active);
      btn.title = active ? 'Remove from wishlist' : 'Add to wishlist';
    });
    Core.$$('[data-wishlist-count]').forEach(el => { el.textContent = list.length; });
  }

  function init() {
    _updateButtons(_load());
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-wishlist-toggle]');
      if (!btn) return;
      e.preventDefault();
      const id   = btn.dataset.wishlistToggle;
      const name = btn.dataset.wishlistName || 'Item';
      const list = _load();
      const idx  = list.indexOf(id);
      if (idx > -1) {
        list.splice(idx, 1);
        _save(list);
        Toast.info(`${Core.sanitize(name)} removed from wishlist.`);
        /* Remove from Firebase if logged in */
        const user = Auth.currentUser();
        if (user) FirebaseManager.remove(`users/${user.uid}/wishlist/${id}`);
      } else {
        list.push(id);
        _save(list);
        Toast.ok(`${Core.sanitize(name)} added to wishlist.`);
        const user = Auth.currentUser();
        if (user) FirebaseManager.update(`users/${user.uid}/wishlist/${id}`, { id, addedAt: Date.now() });
      }
    });
  }

  function has(id)  { return _load().includes(id); }
  function all()    { return _load(); }
  function count()  { return _load().length; }

  return { init, has, all, count };
})();

/* ════════════════════════════════════════════════════════════════
   §8  NAVIGATION MODULE
════════════════════════════════════════════════════════════════ */
const Nav = (() => {
  let _header = null, _lastScroll = 0;

  function init() {
    _header = Core.$('[data-nav-header], header, .nav-header, #nav-header');
    _initMobileMenu();
    _initStickyHeader();
    _initSmoothScroll();
    _initBreadcrumb();
    _initActiveLinks();
    _initBackToTop();
  }

  function _initMobileMenu() {
    const toggle = Core.$('[data-nav-toggle], [data-menu-toggle], #nav-toggle, .hamburger');
    const drawer = Core.$('[data-nav-drawer], [data-nav-menu], #nav-menu, .nav-drawer');
    if (!toggle || !drawer) return;

    toggle.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', open);
      open ? Core.lockScroll() : Core.unlockScroll();
    });

    /* Close on overlay click */
    document.addEventListener('click', e => {
      if (drawer.classList.contains('open')
          && !drawer.contains(e.target)
          && !toggle.contains(e.target)) {
        drawer.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', false);
        Core.unlockScroll();
      }
    });

    /* Close on Escape */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        toggle.classList.remove('active');
        Core.unlockScroll();
      }
    });
  }

  function _initStickyHeader() {
    if (!_header) return;
    const handler = Core.throttle(() => {
      const current = window.scrollY;
      _header.classList.toggle('scrolled',  current > 60);
      _header.classList.toggle('nav-hidden', current > _lastScroll && current > 200);
      _lastScroll = current;
    }, 100);
    window.addEventListener('scroll', handler, { passive: true });
  }

  function _initSmoothScroll() {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (!target) return;
      e.preventDefault();
      const offset = _header ? _header.offsetHeight + 16 : 80;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    });
  }

  function _initBreadcrumb() {
    const bc = Core.$('[data-breadcrumb]');
    if (!bc) return;
    const parts = window.location.pathname.split('/').filter(Boolean);
    const items = [{ label: 'Home', href: '/' }];
    let path = '';
    for (const p of parts) {
      path += '/' + p;
      items.push({ label: p.replace(/[-_]/g, ' ').replace(/\.html$/, '').replace(/\b\w/g, c => c.toUpperCase()), href: path });
    }
    bc.innerHTML = items.map((it, i) =>
      i < items.length - 1
        ? `<a href="${it.href}">${Core.sanitize(it.label)}</a><span aria-hidden="true"> / </span>`
        : `<span aria-current="page">${Core.sanitize(it.label)}</span>`
    ).join('');
  }

  function _initActiveLinks() {
    const current = window.location.pathname;
    Core.$$('a[href]').forEach(a => {
      try {
        const href = new URL(a.href, window.location.origin).pathname;
        if (href === current || (href !== '/' && current.startsWith(href))) {
          a.classList.add('active', 'nav-active');
          a.setAttribute('aria-current', 'page');
        }
      } catch {}
    });
  }

  function _initBackToTop() {
    const btn = Core.$('[data-back-to-top]');
    if (!btn) return;
    const toggle = Core.throttle(() => {
      btn.classList.toggle('visible', window.scrollY > 400);
    }, 200);
    window.addEventListener('scroll', toggle, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  return { init };
})();

/* ════════════════════════════════════════════════════════════════
   §9  SEARCH MODULE
════════════════════════════════════════════════════════════════ */
const Search = (() => {
  let _overlay = null, _input = null, _results = null;
  let _products = [];

  function init() {
    _overlay = Core.$('[data-search-overlay], #search-overlay, .search-overlay');
    _input   = Core.$('[data-search-input], #search-input, .search-input');
    _results = Core.$('[data-search-results], #search-results, .search-results');
    if (!_overlay && !_input) return;

    _loadProducts();
    _bindTriggers();
    if (_input) {
      _input.addEventListener('input', Core.debounce(_handleInput, AurexConfig.search.debounce));
      _input.addEventListener('keydown', _handleKeydown);
    }
  }

  async function _loadProducts() {
    try {
      _products = [];
      const data = await FirebaseManager.get('products');
      if (!data) return;
      _products = Object.entries(data).map(([k, v]) => ({ ...v, id: k }));
    } catch {}
  }

  function _bindTriggers() {
    /* Open search overlay */
    Core.$$('[data-search-open], [data-search-trigger]').forEach(btn => {
      btn.addEventListener('click', open);
    });
    /* Close */
    Core.$$('[data-search-close]').forEach(btn => {
      btn.addEventListener('click', close);
    });
    /* Click outside overlay */
    if (_overlay) {
      _overlay.addEventListener('click', e => {
        if (e.target === _overlay) close();
      });
    }
    /* Keyboard shortcut: / or Ctrl+K */
    document.addEventListener('keydown', e => {
      if ((e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName))
        || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault(); open();
      }
      if (e.key === 'Escape') close();
    });
  }

  function open() {
    if (_overlay) {
      _overlay.classList.add('open', 'active');
      Core.lockScroll();
    }
    if (_input) setTimeout(() => _input.focus(), 80);
    Core.emit('search:open');
  }

  function close() {
    if (_overlay) { _overlay.classList.remove('open', 'active'); }
    Core.unlockScroll();
    Core.emit('search:close');
  }

  function _handleInput(e) {
    const q = e.target.value.trim();
    if (q.length < AurexConfig.search.minChars) {
      if (_results) _results.innerHTML = '';
      return;
    }
    const matches = _products.filter(p =>
      (p.name || '').toLowerCase().includes(q.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(q.toLowerCase()) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q.toLowerCase()))
    ).slice(0, 8);

    _renderResults(matches, q);
  }

  function _renderResults(matches, q) {
    if (!_results) return;
    if (!matches.length) {
      _results.innerHTML = `<div data-search-empty style="padding:24px;text-align:center;color:#7a7060;font-style:italic">No results for "${Core.sanitize(q)}"</div>`;
      return;
    }
    _results.innerHTML = matches.map(p => `
      <a href="product.html?id=${Core.sanitize(p.id)}" data-search-result
         style="display:flex;align-items:center;gap:12px;padding:10px 16px;
                text-decoration:none;color:inherit;border-bottom:1px solid rgba(255,255,255,.05);
                transition:background .18s">
        <img src="${Core.sanitize(p.image || '')}" alt=""
             style="width:44px;height:44px;object-fit:cover;border-radius:6px;background:#18160f"
             onerror="this.style.display='none'">
        <div>
          <div style="font-size:13px;font-weight:500">${_highlight(Core.sanitize(p.name || ''), q)}</div>
          <div style="font-size:10px;color:#7a7060;margin-top:2px">${Core.sanitize(p.category || '')}</div>
        </div>
        <div style="margin-left:auto;font-family:'Cormorant Garamond',serif;font-size:16px;color:#c8a96e">
          ${Core.formatINR(p.price)}
        </div>
      </a>`).join('');

    /* Hover highlight */
    Core.$$('[data-search-result]', _results).forEach(el => {
      el.addEventListener('mouseenter', () => { el.style.background = 'rgba(200,169,110,.06)'; });
      el.addEventListener('mouseleave', () => { el.style.background = ''; });
      el.addEventListener('click', close);
    });
  }

  function _highlight(text, q) {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark style="background:rgba(200,169,110,.25);color:#e2c98f;border-radius:2px">$1</mark>');
  }

  function _handleKeydown(e) {
    if (!_results) return;
    const items = Core.$$('[data-search-result]', _results);
    if (!items.length) return;
    const focused = _results.querySelector('[data-search-result]:focus');
    const idx = items.indexOf(focused);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); items[Math.max(idx - 1, 0)]?.focus(); }
    if (e.key === 'Enter' && focused) focused.click();
  }

  return { init, open, close };
})();

/* ════════════════════════════════════════════════════════════════
   §10  ANIMATIONS MODULE
════════════════════════════════════════════════════════════════ */
const Animations = (() => {
  function init() {
    _initReveal();
    _initParallax();
    _initCounters();
    _initCursorTrail();
  }

  /* Intersection Observer fade-in reveals */
  function _initReveal() {
    const els = Core.$$('[data-reveal], [data-animate], .reveal, .animate-on-scroll');
    if (!els.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el    = entry.target;
        const delay = el.dataset.delay || el.dataset.animateDelay || '0';
        const from  = el.dataset.from  || 'bottom'; // bottom | left | right | top | fade
        const dist  = el.dataset.dist  || '24px';

        const origins = {
          bottom: `translateY(${dist})`,
          top:    `translateY(-${dist})`,
          left:   `translateX(-${dist})`,
          right:  `translateX(${dist})`,
          fade:   'none',
          scale:  'scale(.94)'
        };

        el.style.opacity   = '0';
        el.style.transform = origins[from] || origins.bottom;
        el.style.transition = `opacity .62s ease, transform .62s cubic-bezier(.16,1,.3,1)`;
        el.style.transitionDelay = `${delay}ms`;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.opacity   = '1';
            el.style.transform = 'none';
          });
        });
        observer.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    els.forEach(el => observer.observe(el));
  }

  /* Subtle parallax on [data-parallax] elements */
  function _initParallax() {
    const els = Core.$$('[data-parallax]');
    if (!els.length) return;
    const handler = Core.throttle(() => {
      els.forEach(el => {
        const speed  = parseFloat(el.dataset.parallax) || 0.3;
        const rect   = el.getBoundingClientRect();
        const centre = rect.top + rect.height / 2 - window.innerHeight / 2;
        el.style.transform = `translateY(${centre * speed}px)`;
      });
    }, 16);
    window.addEventListener('scroll', handler, { passive: true });
  }

  /* Animated number counters */
  function _initCounters() {
    const els = Core.$$('[data-counter]');
    if (!els.length) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el      = entry.target;
        const target  = parseFloat(el.dataset.counter);
        const prefix  = el.dataset.prefix || '';
        const suffix  = el.dataset.suffix || '';
        const dur     = parseInt(el.dataset.duration || 1600);
        const start   = Date.now();
        const tick = () => {
          const p = Math.min((Date.now() - start) / dur, 1);
          const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
          el.textContent = prefix + (Number.isInteger(target) ? Math.round(target * ease) : (target * ease).toFixed(1)) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        tick();
        observer.unobserve(el);
      });
    }, { threshold: 0.5 });
    els.forEach(el => observer.observe(el));
  }

  /* Luxury cursor sparkle trail */
  function _initCursorTrail() {
    if (window.matchMedia('(pointer:coarse)').matches) return;
    if (!document.body.dataset.cursorTrail) return;
    document.addEventListener('mousemove', Core.throttle(e => {
      const spark = document.createElement('div');
      spark.style.cssText = `
        position:fixed;left:${e.clientX}px;top:${e.clientY}px;
        width:4px;height:4px;border-radius:50%;
        background:rgba(200,169,110,.7);pointer-events:none;z-index:99998;
        transform:translate(-50%,-50%) scale(1);
        transition:transform .6s ease,opacity .6s ease;
      `;
      document.body.appendChild(spark);
      requestAnimationFrame(() => {
        spark.style.transform = 'translate(-50%,-50%) scale(0)';
        spark.style.opacity   = '0';
      });
      setTimeout(() => spark.remove(), 700);
    }, 40));
  }

  return { init };
})();

/* ════════════════════════════════════════════════════════════════
   §11  MODAL MODULE
════════════════════════════════════════════════════════════════ */
const Modal = (() => {
  function init() {
    /* Open: any [data-modal-open="modal-id"] */
    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-modal-open]');
      if (opener) { e.preventDefault(); open(opener.dataset.modalOpen); }

      const closer = e.target.closest('[data-modal-close]');
      if (closer) { e.preventDefault(); close(closer.closest('[data-modal], .modal-overlay')?.id); }
    });

    /* Close on overlay click */
    document.addEventListener('click', e => {
      if (e.target.matches('[data-modal].open, [data-modal].active')) {
        close(e.target.id);
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const open = Core.$('[data-modal].open, [data-modal].active');
        if (open) close(open.id);
      }
    });
  }

  function open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open', 'active');
    Core.lockScroll();
    Core.emit('modal:open', id);
    el.querySelector('[data-modal-focus], input, button')?.focus();
  }

  function close(id) {
    const el = id ? document.getElementById(id) : Core.$('[data-modal].open');
    if (!el) return;
    el.classList.remove('open', 'active');
    Core.unlockScroll();
    Core.emit('modal:close', id);
  }

  function confirm(message, onConfirm) {
    const id = 'aurex-confirm-modal';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('data-modal', '');
      el.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        display:none;align-items:center;justify-content:center;padding:20px;
        background:rgba(0,0,0,.8);backdrop-filter:blur(5px);
      `;
      el.innerHTML = `
        <div style="background:#111009;border:1px solid rgba(200,169,110,.2);border-radius:14px;
                    padding:32px;max-width:360px;width:100%;text-align:center">
          <div id="${id}-msg" style="font-size:14px;margin-bottom:24px;color:#f0eade;line-height:1.6"></div>
          <div style="display:flex;gap:10px;justify-content:center">
            <button data-modal-close data-confirm-ok
                    style="padding:10px 24px;background:linear-gradient(135deg,#8a6e3e,#c8a96e);
                           color:#1a1208;border:none;border-radius:6px;cursor:pointer;
                           font-family:'Outfit',sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em">
              CONFIRM
            </button>
            <button data-modal-close
                    style="padding:10px 24px;background:transparent;color:#7a7060;
                           border:1px solid rgba(255,255,255,.08);border-radius:6px;cursor:pointer;
                           font-family:'Outfit',sans-serif;font-size:11px">
              CANCEL
            </button>
          </div>
        </div>`;
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    document.getElementById(`${id}-msg`).textContent = message;
    el.querySelector('[data-confirm-ok]').onclick = () => {
      el.style.display = 'none';
      Core.unlockScroll();
      onConfirm();
    };
    el.querySelector('[data-modal-close]:not([data-confirm-ok])').onclick = () => {
      el.style.display = 'none';
      Core.unlockScroll();
    };
    Core.lockScroll();
  }

  return { init, open, close, confirm };
})();

/* ════════════════════════════════════════════════════════════════
   §12  FORM VALIDATION MODULE
════════════════════════════════════════════════════════════════ */
const Validator = (() => {
  const rules = {
    required: v => v.trim() !== ''                   || 'This field is required.',
    email:    v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email address.',
    phone:    v => /^[6-9]\d{9}$/.test(v.replace(/\s/g,''))    || 'Enter a valid 10-digit mobile number.',
    pincode:  v => /^\d{6}$/.test(v.trim())                    || 'Enter a valid 6-digit PIN code.',
    min:      (v, n) => v.trim().length >= n                   || `Minimum ${n} characters required.`,
    max:      (v, n) => v.trim().length <= n                   || `Maximum ${n} characters allowed.`,
    password: v => v.length >= 8                               || 'Password must be at least 8 characters.',
    match:    (v, selector) => v === Core.$(selector)?.value   || 'Fields do not match.',
    number:   v => !isNaN(+v) && v.trim() !== ''               || 'Enter a valid number.',
    card:     v => /^\d{16}$/.test(v.replace(/\s/g,''))        || 'Enter a valid 16-digit card number.',
    cvv:      v => /^\d{3,4}$/.test(v.trim())                  || 'Enter a valid CVV.',
    expiry:   v => /^(0[1-9]|1[0-2])\/\d{2}$/.test(v.trim())  || 'Use MM/YY format.',
  };

  function validateField(input) {
    const validators = (input.dataset.validate || '').split(',').map(v => v.trim()).filter(Boolean);
    for (const rule of validators) {
      const [name, arg] = rule.split(':');
      const fn = rules[name];
      if (!fn) continue;
      const result = fn(input.value, arg);
      if (result !== true) return result;
    }
    return null;
  }

  function showError(input, message) {
    const wrap = input.closest('[data-field], .field, .form-field, .fld') || input.parentElement;
    let errEl = wrap.querySelector('[data-field-error], .field-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.setAttribute('data-field-error', '');
      errEl.style.cssText = 'font-size:11px;color:#d07070;margin-top:5px;font-style:italic';
      wrap.appendChild(errEl);
    }
    errEl.textContent = message;
    errEl.style.display = 'block';
    input.style.borderColor = 'rgba(210,80,80,.6)';
  }

  function clearError(input) {
    const wrap = input.closest('[data-field], .field, .form-field, .fld') || input.parentElement;
    const errEl = wrap.querySelector('[data-field-error], .field-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    input.style.borderColor = '';
  }

  function validateForm(form) {
    let valid = true;
    const inputs = Core.$$('input[data-validate], select[data-validate], textarea[data-validate]', form);
    inputs.forEach(input => {
      const error = validateField(input);
      if (error) { showError(input, error); valid = false; }
      else        { clearError(input); }
    });
    return valid;
  }

  function initLiveValidation(form) {
    Core.$$('input[data-validate], select[data-validate], textarea[data-validate]', form).forEach(input => {
      input.addEventListener('blur', () => {
        const error = validateField(input);
        if (error) showError(input, error);
        else       clearError(input);
      });
      input.addEventListener('input', () => clearError(input));
    });
  }

  /* Auto-format card number as user types */
  function formatCardInput(input) {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0, 16);
      input.value = v.replace(/(.{4})/g, '$1 ').trim();
    });
  }

  /* Auto-format expiry */
  function formatExpiryInput(input) {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0, 4);
      if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
      input.value = v;
    });
  }

  return { validateField, showError, clearError, validateForm, initLiveValidation, formatCardInput, formatExpiryInput };
})();

/* ════════════════════════════════════════════════════════════════
   §13  PAGE: INDEX  (index.html)
════════════════════════════════════════════════════════════════ */
const PageIndex = (() => {
  function init() {
    _loadFeaturedProducts();
    _initHeroSlider();
    _initNewsletterForm();
    _initTestimonialCarousel();
  }

  async function _loadFeaturedProducts() {
    const grid = Core.$('[data-featured-products], #featured-products, .featured-grid');
    if (!grid) return;
    const skeleton = grid.innerHTML;
    try {
      const data = await FirebaseManager.get('products');
      if (!data) { grid.innerHTML = '<p style="text-align:center;color:#7a7060">No products found.</p>'; return; }
      const products = Object.entries(data).map(([k, v]) => ({ ...v, id: k })).slice(0, 8);
      grid.innerHTML = products.map(_productCard).join('');
      Animations._initReveal();
      Wishlist.init();
    } catch(e) {
      console.warn('[AUREX PageIndex] Product load failed', e);
    }
  }

  function _productCard(p) {
    const finalPrice = p.discount ? p.price * (1 - p.discount / 100) : p.price;
    return `
      <div class="product-card" data-reveal data-product-id="${Core.sanitize(p.id)}"
           data-product-name="${Core.sanitize(p.name)}"
           data-product-price="${finalPrice}"
           data-product-image="${Core.sanitize(p.image || '')}">
        <a href="product.html?id=${Core.sanitize(p.id)}" class="product-card__image-link">
          <img src="${Core.sanitize(p.image || '')}"
               alt="${Core.sanitize(p.name || '')}"
               loading="lazy"
               onerror="this.src='https://placehold.co/400x300/18160f/4a4030?text=VP+AUREX'">
          ${p.discount ? `<span class="product-card__badge">-${p.discount}%</span>` : ''}
        </a>
        <div class="product-card__info">
          <h3 class="product-card__name">${Core.sanitize(p.name || '')}</h3>
          <div class="product-card__price">
            ${p.discount ? `<span class="product-card__price--old">${Core.formatINR(p.price)}</span>` : ''}
            <span class="product-card__price--final">${Core.formatINR(finalPrice)}</span>
          </div>
          <div class="product-card__actions">
            <button class="btn btn-gold" data-add-to-cart
                    data-product-id="${Core.sanitize(p.id)}"
                    data-product-name="${Core.sanitize(p.name)}"
                    data-product-price="${finalPrice}"
                    data-product-image="${Core.sanitize(p.image || '')}">
              Add to Cart
            </button>
            <button class="btn-wishlist" data-wishlist-toggle="${Core.sanitize(p.id)}"
                    data-wishlist-name="${Core.sanitize(p.name)}"
                    aria-label="Add to wishlist">
              ♡
            </button>
          </div>
        </div>
      </div>`;
  }

  function _initHeroSlider() {
    const slider = Core.$('[data-hero-slider], .hero-slider');
    if (!slider) return;
    const slides = Core.$$('[data-slide], .slide', slider);
    if (slides.length < 2) return;
    let current = 0;
    const advance = () => {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    };
    slides[0].classList.add('active');
    const interval = setInterval(advance, 5000);
    Core.$$('[data-slide-prev]', slider).forEach(b => b.addEventListener('click', () => { clearInterval(interval); current = (current - 1 + slides.length) % slides.length; slides.forEach(s => s.classList.remove('active')); slides[current].classList.add('active'); }));
    Core.$$('[data-slide-next]', slider).forEach(b => b.addEventListener('click', () => { clearInterval(interval); advance(); }));
  }

  function _initNewsletterForm() {
    const form = Core.$('[data-newsletter-form], #newsletter-form, .newsletter-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!Validator.validateForm(form)) return;
      const email = form.querySelector('input[type=email]')?.value.trim();
      if (!email) return;
      const btn = form.querySelector('[type=submit], button');
      if (btn) { btn.disabled = true; btn.textContent = 'Subscribing…'; }
      try {
        await FirebaseManager.push('newsletter', { email, subscribedAt: Date.now() });
        Toast.ok('You\'ve been subscribed! Thank you.');
        form.reset();
      } catch {
        Toast.err('Something went wrong. Please try again.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Subscribe'; }
      }
    });
  }

  function _initTestimonialCarousel() {
    const c = Core.$('[data-testimonial-carousel], .testimonials-carousel');
    if (!c) return;
    const items = Core.$$('[data-testimonial], .testimonial', c);
    if (items.length < 2) return;
    let cur = 0;
    const show = idx => { items.forEach((it, i) => it.classList.toggle('active', i === idx)); };
    show(0);
    Core.$$('[data-testimonial-next]', c).forEach(b => b.addEventListener('click', () => { cur = (cur + 1) % items.length; show(cur); }));
    Core.$$('[data-testimonial-prev]', c).forEach(b => b.addEventListener('click', () => { cur = (cur - 1 + items.length) % items.length; show(cur); }));
    setInterval(() => { cur = (cur + 1) % items.length; show(cur); }, 6000);
  }

  return { init };
})();

/* ════════════════════════════════════════════════════════════════
   §14  PAGE: PRODUCT  (product.html?id=...)
════════════════════════════════════════════════════════════════ */
const PageProduct = (() => {
  let _product = null;

  function init() {
    const { id } = Core.params();
    if (id) _loadProduct(id);
    _initQtyControls();
    _initReviewForm();
    _initImageZoom();
  }

  async function _loadProduct(id) {
    try {
      _product = await FirebaseManager.get(`products/${id}`);
      if (!_product) { Toast.err('Product not found.'); return; }
      _product.id = id;
      _renderProduct(_product);
      _loadRelated(_product.category);
    } catch(e) {
      Toast.err('Failed to load product.');
    }
  }

  function _renderProduct(p) {
    _setField('[data-product-title]',       p.name);
    _setField('[data-product-price]',       Core.formatINR(p.discount ? p.price*(1-p.discount/100) : p.price));
    _setField('[data-product-description]', p.description);
    _setField('[data-product-category]',    p.category);
    _setField('[data-product-stock]',       p.stock > 0 ? `${p.stock} in stock` : 'Out of stock');

    const img = Core.$('[data-product-hero-image], .product-hero-image');
    if (img && p.image) { img.src = p.image; img.alt = p.name; }

    /* Update add-to-cart button */
    Core.$$('[data-add-to-cart]').forEach(btn => {
      btn.dataset.productId    = p.id;
      btn.dataset.productName  = p.name;
      btn.dataset.productPrice = p.discount ? p.price*(1-p.discount/100) : p.price;
      btn.dataset.productImage = p.image || '';
      if (p.stock <= 0) { btn.disabled = true; btn.textContent = 'Out of Stock'; }
    });

    /* Wishlist button */
    Core.$$('[data-wishlist-toggle]').forEach(btn => {
      btn.dataset.wishlistToggle = p.id;
      btn.dataset.wishlistName   = p.name;
    });

    document.title = `${Core.sanitize(p.name)} — VP AUREX`;
  }

  function _setField(selector, value) {
    Core.$$(selector).forEach(el => {
      el.textContent = value || '';
    });
  }

  function _initQtyControls() {
    const dec = Core.$('[data-qty-dec]');
    const inc = Core.$('[data-qty-inc]');
    const inp = Core.$('[data-qty-input]');
    if (!inp) return;
    dec?.addEventListener('click', () => { inp.value = Math.max(1, Number(inp.value) - 1); });
    inc?.addEventListener('click', () => { inp.value = Math.min(AurexConfig.cart.maxQty, Number(inp.value) + 1); });

    /* Sync qty to add-to-cart data attribute */
    inp.addEventListener('change', () => {
      Core.$$('[data-add-to-cart]').forEach(btn => { btn.dataset.qty = inp.value; });
    });
  }

  async function _loadRelated(category) {
    const grid = Core.$('[data-related-products], .related-products');
    if (!grid) return;
    try {
      const data = await FirebaseManager.get('products');
      if (!data) return;
      const related = Object.entries(data)
        .map(([k, v]) => ({ ...v, id: k }))
        .filter(p => p.category === category && p.id !== _product?.id)
        .slice(0, 4);
      grid.innerHTML = related.map(p => PageIndex._productCard?.(p) || '').join('');
      Wishlist.init();
    } catch {}
  }

  function _initReviewForm() {
    const form = Core.$('[data-review-form], #review-form, .review-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!Auth.isLoggedIn()) { Toast.warn('Please sign in to leave a review.'); return; }
      if (!Validator.validateForm(form)) return;
      const user    = Auth.currentUser();
      const rating  = Core.$('[data-review-rating]:checked, [name=rating]:checked', form)?.value || 5;
      const text    = Core.$('[data-review-text], textarea', form)?.value.trim();
      const { id }  = Core.params();
      if (!text || !id) return;
      const review = { uid: user.uid, name: user.displayName || 'Anonymous', rating: +rating, text, createdAt: Date.now() };
      try {
        await FirebaseManager.push(`reviews/${id}`, review);
        Toast.ok('Review submitted. Thank you!');
        form.reset();
      } catch { Toast.err('Failed to submit review.'); }
    });
  }

  function _initImageZoom() {
    const hero = Core.$('[data-product-hero-image]');
    if (!hero) return;
    hero.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out`;
      overlay.innerHTML = `<img src="${hero.src}" style="max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px">`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
  }

  return { init };
})();

/* ════════════════════════════════════════════════════════════════
   §15  PAGE: SHOP  (shop.html / products.html)
════════════════════════════════════════════════════════════════ */
const PageShop = (() => {
  let _products = [], _filtered = [], _page = 1;
  const PER_PAGE = 12;

  function init() {
    _loadProducts();
    _initFilterPanel();
    _initSortControl();
    _initMobileFilterToggle();
  }

  async function _loadProducts() {
    const grid = Core.$('[data-products-grid], #products-grid, .products-grid');
    if (!grid) return;
    grid.innerHTML = _skeletonCards(PER_PAGE);
    try {
      const data = await FirebaseManager.get('products');
      if (!data) { grid.innerHTML = '<p style="text-align:center;padding:40px;color:#7a7060">No products found.</p>'; return; }
      _products = Object.entries(data).map(([k, v]) => ({ ...v, id: k }));
      _filtered = [..._products];
      _applyFiltersFromURL();
      _render();
    } catch(e) { Toast.err('Failed to load products.'); }
  }

  function _skeletonCards(n) {
    return Array(n).fill(0).map(() => `
      <div style="background:rgba(255,255,255,.03);border-radius:10px;overflow:hidden;aspect-ratio:3/4">
        <div style="height:60%;background:rgba(255,255,255,.04);animation:aurex-shimmer 1.4s ease infinite"></div>
        <div style="padding:14px">
          <div style="height:12px;background:rgba(255,255,255,.05);border-radius:4px;margin-bottom:8px;animation:aurex-shimmer 1.4s ease infinite"></div>
          <div style="height:10px;background:rgba(255,255,255,.04);border-radius:4px;width:60%;animation:aurex-shimmer 1.4s ease infinite"></div>
        </div>
      </div>`).join('');
  }

  function _render() {
    const grid = Core.$('[data-products-grid], #products-grid, .products-grid');
    if (!grid) return;
    const start = (_page - 1) * PER_PAGE;
    const slice = _filtered.slice(start, start + PER_PAGE);
    grid.innerHTML = slice.length
      ? slice.map(p => PageIndex._productCard?.(p) || '').join('')
      : '<p style="text-align:center;padding:40px;color:#7a7060;grid-column:1/-1">No products match your filters.</p>';

    _renderPagination();
    Animations.init();
    Wishlist.init();

    const count = Core.$('[data-product-count], .product-count');
    if (count) count.textContent = `${_filtered.length} products`;
  }

  function _renderPagination() {
    const el = Core.$('[data-pagination], .pagination');
    if (!el) return;
    const pages = Math.ceil(_filtered.length / PER_PAGE);
    if (pages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = Array.from({ length: pages }, (_, i) =>
      `<button data-page="${i+1}" class="pg-btn${i+1===_page?' active':''}"
               style="${i+1===_page?'border-color:#c8a96e;color:#c8a96e':''}">${i+1}</button>`
    ).join('');
    el.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        _page = parseInt(btn.dataset.page);
        _render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function _initFilterPanel() {
    Core.$$('[data-filter-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.filterCategory;
        Core.$$('[data-filter-category]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _filtered = cat === 'all' ? [..._products] : _products.filter(p => p.category === cat);
        _page = 1;
        Core.setParam('category', cat !== 'all' ? cat : '');
        _applySortOrder();
        _render();
      });
    });

    /* Price range */
    const priceMin = Core.$('[data-filter-price-min]');
    const priceMax = Core.$('[data-filter-price-max]');
    const priceBtn = Core.$('[data-filter-price-apply]');
    if (priceBtn) {
      priceBtn.addEventListener('click', () => {
        const min = +priceMin?.value || 0;
        const max = +priceMax?.value || Infinity;
        _filtered = _products.filter(p => p.price >= min && p.price <= max);
        _page = 1; _render();
      });
    }

    /* Clear filters */
    Core.$$('[data-filter-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        _filtered = [..._products];
        _page = 1;
        Core.$$('[data-filter-category]').forEach(b => b.classList.remove('active'));
        Core.$('[data-filter-category="all"]')?.classList.add('active');
        if (priceMin) priceMin.value = '';
        if (priceMax) priceMax.value = '';
        Core.setParam('category', '');
        _render();
      });
    });
  }

  function _initSortControl() {
    const sel = Core.$('[data-sort], #sort-select, .sort-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      Core.setParam('sort', sel.value);
      _applySortOrder();
      _render();
    });
  }

  function _applySortOrder() {
    const sel  = Core.$('[data-sort], #sort-select, .sort-select');
    const sort = sel?.value || Core.params().sort || 'default';
    switch (sort) {
      case 'price-asc':  _filtered.sort((a, b) => a.price - b.price); break;
      case 'price-desc': _filtered.sort((a, b) => b.price - a.price); break;
      case 'name-asc':   _filtered.sort((a, b) => (a.name||'').localeCompare(b.name||'')); break;
      case 'newest':     _filtered.sort((a, b) => (b.createdAt||0) - (a.createdAt||0)); break;
    }
  }

  function _applyFiltersFromURL() {
    const { category, sort } = Core.params();
    if (category) {
      _filtered = _products.filter(p => p.category === category);
      Core.$$(`[data-filter-category="${category}"]`).forEach(b => b.classList.add('active'));
    }
    const sel = Core.$('[data-sort]');
    if (sel && sort) sel.value = sort;
    _applySortOrder();
  }

  function _initMobileFilterToggle() {
    const toggle = Core.$('[data-filter-toggle]');
    const panel  = Core.$('[data-filter-panel], .filter-panel');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', () => panel.classList.toggle('open'));
  }

  return { init };
})();

/* ════════════════════════════════════════════════════════════════
   §16  PAGE: CART  (cart.html)
════════════════════════════════════════════════════════════════ */
const PageCart = (() => {
  function init() {
    _render();
    _initCouponForm();
    Core.on('cart:change', _render);
  }

  function _render() {
    const body      = Core.$('[data-cart-body], #cart-body, .cart-items');
    const summary   = Core.$('[data-cart-summary], #cart-summary, .cart-summary');
    const emptyMsg  = Core.$('[data-cart-empty], .cart-empty');
    const cartWrap  = Core.$('[data-cart-content], .cart-content');

    if (Cart.isEmpty()) {
      if (emptyMsg)  emptyMsg.style.display  = '';
      if (cartWrap)  cartWrap.style.display  = 'none';
      return;
    }
    if (emptyMsg)  emptyMsg.style.display  = 'none';
    if (cartWrap)  cartWrap.style.display  = '';

    if (body) {
      body.innerHTML = Cart.items().map(item => `
        <div class="cart-row" data-cart-row="${Core.sanitize(item.id)}">
          <img src="${Core.sanitize(item.image)}" alt="${Core.sanitize(item.name)}"
               style="width:72px;height:72px;object-fit:cover;border-radius:8px;background:#18160f"
               onerror="this.style.display='none'">
          <div class="cart-row__info">
            <div class="cart-row__name">${Core.sanitize(item.name)}</div>
            <div class="cart-row__price">${Core.formatINR(item.price)}</div>
          </div>
          <div class="cart-row__qty">
            <button class="qty-btn" data-cart-qty-dec="${Core.sanitize(item.id)}">−</button>
            <input type="number" value="${item.qty}" min="1" max="${AurexConfig.cart.maxQty}"
                   data-cart-qty-input="${Core.sanitize(item.id)}"
                   style="width:48px;text-align:center">
            <button class="qty-btn" data-cart-qty-inc="${Core.sanitize(item.id)}">+</button>
          </div>
          <div class="cart-row__total">${Core.formatINR(item.price * item.qty)}</div>
          <button data-remove-cart-item="${Core.sanitize(item.id)}"
                  aria-label="Remove" class="cart-row__remove">✕</button>
        </div>`).join('');

      /* Qty inc/dec buttons */
      body.querySelectorAll('[data-cart-qty-dec]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.cartQtyDec;
          const item = Cart.items().find(i => i.id === id);
          if (item) Cart.updateQty(id, item.qty - 1);
        });
      });
      body.querySelectorAll('[data-cart-qty-inc]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.cartQtyInc;
          const item = Cart.items().find(i => i.id === id);
          if (item) Cart.updateQty(id, item.qty + 1);
        });
      });
    }

    _updateSummary();
  }

  function _updateSummary() {
    const sub     = Cart.subtotal();
    const coupon  = Cart.getCoupon();
    const disc    = coupon ? sub * coupon.discount / 100 : 0;
    const total   = sub - disc;
    const ship    = total > 999 ? 0 : 99;

    _setText('[data-cart-subtotal]',  Core.formatINR(sub));
    _setText('[data-cart-discount]',  coupon ? `-${Core.formatINR(disc)}` : '—');
    _setText('[data-cart-shipping]',  ship === 0 ? 'Free' : Core.formatINR(ship));
    _setText('[data-cart-total]',     Core.formatINR(total + ship));
    _setText('[data-coupon-applied]', coupon ? `${coupon.code} (${coupon.discount}% off)` : '');
  }

  function _setText(sel, val) {
    Core.$$(sel).forEach(el => { el.textContent = val; });
  }

  function _initCouponForm() {
    const form = Core.$('[data-coupon-form], #coupon-form, .coupon-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const inp  = form.querySelector('input');
      const code = inp?.value.trim();
      if (!code) return;
      const res = Cart.applyCoupon(code);
      if (res.valid) {
        Toast.ok(res.message);
        _updateSummary();
        if (inp) inp.value = '';
      } else {
        Toast.err(res.message);
      }
    });
  }

  return { init };
})();

/* ════════════════════════════════════════════════════════════════
   §17  PAGE: CHECKOUT  (checkout.html)
════════════════════════════════════════════════════════════════ */
const PageCheckout = (() => {
  let _step = 1;
  const STEPS = ['contact', 'shipping', 'payment', 'review'];

  function init() {
    if (Cart.isEmpty()) {
      Toast.warn('Your cart is empty. Add products before checking out.');
      setTimeout(() => window.location.href = 'index.html', 2000);
      return;
    }
    _renderOrderSummary();
    _initStepNav();
    _initPaymentToggle();
    _initPlaceOrder();
    _initAddressAutofill();
    const form = Core.$('[data-checkout-form], #checkout-form, form');
    if (form) Validator.initLiveValidation(form);
  }

  function _renderOrderSummary() {
    const el = Core.$('[data-checkout-summary], #checkout-summary, .checkout-summary');
    if (!el) return;
    const items  = Cart.items();
    const sub    = Cart.subtotal();
    const coupon = Cart.getCoupon();
    const disc   = coupon ? sub * coupon.discount / 100 : 0;
    const total   = sub - disc;
// Loja online pública do Prumo: página da campanha + catálogo + carrinho + pedido.
// Dados vêm de 3 funções seguras do banco (pe_store_get, pe_place_order, pe_track).
// Com ?demo=1 usa os dados de demonstração guardados neste navegador (para pré-visualizar).
(function () {
  const root = document.getElementById('shop');
  const qs = new URLSearchParams(location.search);
  const slug = (qs.get('l') || '').toLowerCase(), campSlug = (qs.get('c') || '').toLowerCase(), demo = qs.get('demo') === '1';
  const LS_DEMO = 'prumo_demo_v1';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
  const safeUrl = u => (/^(https?:\/\/|data:image\/)/i.test(u || '') ? u : '');
  const digits = s => String(s || '').replace(/\D/g, '');
  const maskPhone = v => { const d = digits(v).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };

  const S = { data: null, cart: {}, q: '', cat: '', sb: null, done: null, error: '', sending: false };
  const cartKey = 'prumo_cart_' + (demo ? 'demo' : slug);
  try { S.cart = JSON.parse(localStorage.getItem(cartKey) || '{}'); } catch { S.cart = {}; }
  const saveCart = () => { try { localStorage.setItem(cartKey, JSON.stringify(S.cart)); } catch { /* sem armazenamento */ } };

  /* ---------- Dados ---------- */
  async function load() {
    if (demo) {
      const raw = localStorage.getItem(LS_DEMO); if (!raw) return null;
      const L = JSON.parse(raw); if (!L.company) return null;
      const st = L.company.store_settings || {};
      let prods = (L.products || []).filter(p => p.published && p.active !== false);
      if (!prods.length) prods = (L.products || []).filter(p => p.active !== false).slice(0, 12);   // pré-visualização: mostra produtos mesmo sem publicar
      const camp = (L.campaigns || []).find(c => c.slug && c.slug === campSlug) || null;
      return {
        company: { name: L.company.name, whatsapp: st.whatsapp, headline: st.headline, about: st.about, accent: st.accent, show_prices: st.show_prices !== false, logo: st.logo_url, instagram: st.instagram },
        products: prods.map(p => ({ id: p.id, name: p.name, price: Number(p.price), category: p.category, description: p.description, image: p.image_url, available: p.is_service || Number(p.stock) > 0 })),
        campaign: camp ? { name: camp.name, product_id: camp.product_id, price: camp.price, ends_at: camp.ends_at, landing: camp.landing || {} } : null
      };
    }
    if (!slug) return null;
    if (!window.supabase || !PE.config.SUPABASE_ANON_KEY) throw new Error('Loja indisponível no momento.');
    S.sb = window.supabase.createClient(PE.config.SUPABASE_URL, PE.config.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await S.sb.rpc('pe_store_get', { p_slug: slug, p_camp: campSlug || null });
    if (error) throw new Error('Não foi possível carregar a loja.');
    return data;
  }
  function track(kind) {
    if (demo || !S.sb) return;
    const k = `pj_${slug}_${campSlug}_${kind}`;
    if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1');
    S.sb.rpc('pe_track', { p_slug: slug, p_camp: campSlug || null, p_kind: kind }).then(() => {}, () => {});
  }

  /* ---------- Cálculos ---------- */
  const campOffer = () => { const c = S.data.campaign; return c && c.product_id && c.price ? { id: c.product_id, price: Number(c.price) } : null; };
  const priceOf = p => { const o = campOffer(); return o && o.id === p.id ? o.price : Number(p.price); };
  const cartLines = () => Object.entries(S.cart).map(([id, qty]) => ({ p: S.data.products.find(x => x.id === id), qty })).filter(l => l.p && l.qty > 0);
  const cartCount = () => cartLines().reduce((t, l) => t + l.qty, 0);
  const cartTotal = () => cartLines().reduce((t, l) => t + priceOf(l.p) * l.qty, 0);
  const showPrices = () => S.data.company.show_prices !== false;
  const money = v => (showPrices() ? brl(v) : 'Consulte');

  function setAccent() {
    const a = S.data.company.accent;
    if (/^#[0-9a-f]{6}$/i.test(a || '')) {
      const r = parseInt(a.slice(1, 3), 16), g = parseInt(a.slice(3, 5), 16), b = parseInt(a.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent', a);
      document.documentElement.style.setProperty('--accent-ink', (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111113' : '#ffffff');
    }
  }

  /* ---------- Telas ---------- */
  function header() {
    const c = S.data.company, logo = safeUrl(c.logo), n = cartCount();
    return `<header class="lj-top"><div class="lj-top-in"><div class="lj-logo">${logo ? `<img src="${esc(logo)}" alt="">` : esc((c.name || 'L')[0].toUpperCase())}</div><div class="lj-name">${esc(c.name)}</div>
      <button class="lj-cart-btn" data-a="cart" aria-label="Ver pedido"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.5h11L21 7H6"/></svg>${n ? `<b>${n}</b>` : ''}</button></div></header>`;
  }
  function hero() {
    const c = S.data.campaign, co = S.data.company;
    if (!c) return `<section class="lj-intro lj-wrap" style="padding-left:0;padding-right:0"><h1>${esc(co.headline || 'Nossos produtos')}</h1>${co.about ? `<p>${esc(co.about)}</p>` : ''}</section>`;
    const L = c.landing || {}, img = safeUrl(L.image), bullets = (L.bullets || []).filter(Boolean).slice(0, 5);
    let left = '';
    if (c.ends_at) { const d = Math.round((new Date(c.ends_at + 'T23:59:59') - new Date()) / 86400000); left = d <= 0 ? 'Último dia!' : d === 1 ? 'Termina amanhã' : `Termina em ${d} dias`; }
    return `<section class="lj-hero ${img ? 'has-img' : ''}">${img ? `<img class="lj-hero-img" src="${esc(img)}" alt="">` : ''}<div class="lj-hero-body">
      ${left ? `<span class="lj-badge">⏳ ${esc(left)}</span>` : '<span class="lj-badge">Oferta especial</span>'}
      <h1>${esc(L.headline || c.name)}</h1>${L.subheadline ? `<p>${esc(L.subheadline)}</p>` : ''}
      ${bullets.length ? `<ul class="lj-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      <a class="lj-cta" href="#produtos" data-a="scroll">${esc(L.cta || 'Ver produtos')} →</a>${c.ends_at ? `<div class="lj-count">Válido até ${esc(c.ends_at.split('-').reverse().join('/'))}</div>` : ''}</div></section>`;
  }
  function card(p) {
    const qty = S.cart[p.id] || 0, off = campOffer(), isOff = off && off.id === p.id, img = safeUrl(p.image);
    return `<article class="lj-card">${isOff ? '<span class="lj-tag">Oferta</span>' : ''}
      <div class="lj-photo" data-a="detail" data-id="${p.id}">${img ? `<img loading="lazy" src="${esc(img)}" alt="${esc(p.name)}">` : `<span class="lj-ph">${esc((p.name || '?')[0].toUpperCase())}</span>`}</div>
      <div class="lj-info"><div class="lj-pname" data-a="detail" data-id="${p.id}">${esc(p.name)}</div>
      <div class="lj-price">${money(priceOf(p))}${isOff && showPrices() && Number(p.price) > priceOf(p) ? `<span class="lj-old">${brl(p.price)}</span>` : ''}</div>
      ${!p.available ? '<button class="lj-add" disabled>Indisponível</button>'
        : qty ? `<div class="lj-step"><button data-a="dec" data-id="${p.id}" aria-label="Menos">−</button><span>${qty}</span><button data-a="inc" data-id="${p.id}" aria-label="Mais">+</button></div>`
          : `<button class="lj-add" data-a="inc" data-id="${p.id}">Adicionar</button>`}</div></article>`;
  }
  function catalog() {
    const all = S.data.products, cats = [...new Set(all.map(p => p.category).filter(Boolean))];
    const q = S.q.trim().toLowerCase(), off = campOffer();
    let list = all.filter(p => (!S.cat || p.category === S.cat) && (!q || (p.name + ' ' + (p.description || '')).toLowerCase().includes(q)));
    if (off) list = [...list].sort((a, b) => (b.id === off.id) - (a.id === off.id));
    return `<section class="lj-section" id="produtos"><input class="lj-search" placeholder="Buscar produto…" data-in="q" value="${esc(S.q)}" aria-label="Buscar produto">
      ${cats.length > 1 ? `<div class="lj-cats"><button class="lj-chip ${S.cat ? '' : 'on'}" data-a="cat" data-v="">Todos</button>${cats.map(c => `<button class="lj-chip ${S.cat === c ? 'on' : ''}" data-a="cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div style="height:14px"></div>${list.length ? `<div class="lj-grid">${list.map(card).join('')}</div>` : '<div class="lj-none">Nenhum produto encontrado.</div>'}</section>`;
  }
  function render(keepFocus) {
    if (!S.data) return;
    const n = cartCount();
    const active = keepFocus && document.activeElement && document.activeElement.dataset.in === 'q' ? document.activeElement.selectionStart : null;
    root.innerHTML = `${header()}<main class="lj-wrap">${hero()}${catalog()}</main>
      <footer class="lj-foot">${esc(S.data.company.name)} · Loja online feita com <a href="https://chausselicita-lang.github.io/prumo/" target="_blank" rel="noopener">Prumo</a></footer>
      ${n ? `<button class="lj-bar" data-a="cart"><span>Ver pedido (${n})</span><span>${showPrices() ? brl(cartTotal()) : 'Enviar'}</span></button>` : ''}`;
    if (active !== null) { const i = root.querySelector('[data-in=q]'); i.focus(); i.setSelectionRange(active, active); }
  }

  /* ---------- Folhas ---------- */
  function sheet(html) { closeSheet(); const ov = document.createElement('div'); ov.className = 'lj-ov'; ov.id = 'lj-ov'; ov.innerHTML = `<div class="lj-sheet" role="dialog" aria-modal="true">${html}</div>`; ov.addEventListener('mousedown', e => { if (e.target === ov) closeSheet(); }); document.body.appendChild(ov); document.body.style.overflow = 'hidden'; }
  function closeSheet() { document.getElementById('lj-ov')?.remove(); document.body.style.overflow = ''; }
  function openDetail(id) {
    const p = S.data.products.find(x => x.id === id); if (!p) return; const img = safeUrl(p.image), off = campOffer(), isOff = off && off.id === p.id;
    sheet(`<div class="lj-sheet-head"><h2>${esc(p.name)}</h2><button class="lj-x" data-a="close" aria-label="Fechar">✕</button></div>
      ${img ? `<img class="lj-detail-img" src="${esc(img)}" alt="${esc(p.name)}">` : ''}
      <div class="lj-price" style="font-size:24px">${money(priceOf(p))}${isOff && showPrices() && Number(p.price) > priceOf(p) ? `<span class="lj-old">${brl(p.price)}</span>` : ''}</div>
      ${p.description ? `<p style="color:var(--muted);white-space:pre-line">${esc(p.description)}</p>` : ''}
      <div style="height:8px"></div>${p.available ? `<button class="lj-primary" data-a="inc-close" data-id="${p.id}">Adicionar ao pedido</button>` : '<button class="lj-ghost" disabled>Indisponível</button>'}`);
  }
  function openCart() {
    const lines = cartLines();
    if (!lines.length) { sheet(`<div class="lj-sheet-head"><h2>Seu pedido</h2><button class="lj-x" data-a="close" aria-label="Fechar">✕</button></div><div class="lj-none">Seu pedido está vazio.<br>Escolha produtos para continuar.</div>`); return; }
    const saved = (() => { try { return JSON.parse(localStorage.getItem('prumo_buyer') || '{}'); } catch { return {}; } })();
    sheet(`<div class="lj-sheet-head"><h2>Seu pedido</h2><button class="lj-x" data-a="close" aria-label="Fechar">✕</button></div>
      ${lines.map(l => `<div class="lj-line"><div class="t"><b>${esc(l.p.name)}</b><small>${money(priceOf(l.p))} cada</small></div><div class="lj-step" style="width:118px;margin:0"><button data-a="dec" data-id="${l.p.id}" data-keep="1">−</button><span>${l.qty}</span><button data-a="inc" data-id="${l.p.id}" data-keep="1">+</button></div></div>`).join('')}
      <div class="lj-total"><span>Total</span><span>${showPrices() ? brl(cartTotal()) : 'a combinar'}</span></div>
      <form class="lj-form" id="lj-form" novalidate>
        <div class="lj-field"><label for="lj-name">Seu nome</label><input class="lj-input" id="lj-name" autocomplete="name" value="${esc(saved.name || '')}" maxlength="80" required></div>
        <div class="lj-field"><label for="lj-phone">Seu WhatsApp</label><input class="lj-input" id="lj-phone" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" value="${esc(saved.phone || '')}" required></div>
        <div class="lj-field"><label for="lj-notes">Observações (opcional)</label><input class="lj-input" id="lj-notes" maxlength="300" placeholder="Tamanho, cor, horário de retirada…"></div>
        <label class="lj-consent"><input type="checkbox" id="lj-consent"> <span>Autorizo ${esc(S.data.company.name)} a usar meu nome e telefone para atender este pedido (LGPD).</span></label>
        <div id="lj-err" class="lj-err" style="display:none"></div>
        <button class="lj-primary" id="lj-send" type="submit">Enviar pedido</button>
      </form>`);
    const ph = document.getElementById('lj-phone'); ph.addEventListener('input', () => { ph.value = maskPhone(ph.value); });
    document.getElementById('lj-form').addEventListener('submit', submitOrder);
  }
  function showError(msg) { const e = document.getElementById('lj-err'); if (e) { e.textContent = msg; e.style.display = 'block'; e.scrollIntoView({ block: 'nearest' }); } }

  async function submitOrder(ev) {
    ev.preventDefault(); if (S.sending) return;
    const name = document.getElementById('lj-name').value.trim(), phone = document.getElementById('lj-phone').value, notes = document.getElementById('lj-notes').value.trim(), consent = document.getElementById('lj-consent').checked;
    if (name.length < 2) return showError('Informe o seu nome.');
    if (digits(phone).length < 10) return showError('Informe um WhatsApp válido, com DDD.');
    if (!consent) return showError('Marque a autorização para enviar o pedido.');
    const lines = cartLines(); if (!lines.length) return showError('Seu pedido está vazio.');
    const btn = document.getElementById('lj-send'); S.sending = true; btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      let res;
      if (demo) res = placeDemoOrder(name, phone, notes, lines);
      else {
        const { data, error } = await S.sb.rpc('pe_place_order', { p_slug: slug, p_camp: campSlug || null, p_name: name, p_phone: phone, p_notes: notes || null, p_items: lines.map(l => ({ id: l.p.id, qty: l.qty })), p_consent: true });
        if (error) throw new Error(/violates|permission|function|schema/i.test(error.message) ? 'Não foi possível enviar agora. Tente pelo WhatsApp da loja.' : error.message);
        res = data;
      }
      try { localStorage.setItem('prumo_buyer', JSON.stringify({ name, phone })); } catch { /* ok */ }
      S.cart = {}; saveCart(); S.done = { res, name }; closeSheet(); render(); showDone();
    } catch (e) { showError(e.message || 'Não foi possível enviar o pedido.'); btn.disabled = false; btn.textContent = 'Enviar pedido'; }
    finally { S.sending = false; }
  }
  function placeDemoOrder(name, phone, notes, lines) {
    const L = JSON.parse(localStorage.getItem(LS_DEMO)); const code = Math.random().toString(36).slice(2, 8).toUpperCase(), d = digits(phone);
    let cust = (L.customers || []).find(c => digits(c.whatsapp || c.phone).slice(-10) === d.slice(-10));
    if (!cust) { cust = { id: crypto.randomUUID(), company_id: L.company.id, name, phone, whatsapp: phone, origin: 'Loja online', created_at: new Date().toISOString() }; (L.customers = L.customers || []).unshift(cust); }
    const camp = (L.campaigns || []).find(c => c.slug && c.slug === campSlug) || null;
    const items = lines.map(l => { const full = (L.products || []).find(p => p.id === l.p.id) || {}; return { product_id: l.p.id, name: l.p.name, qty: l.qty, unit_price: priceOf(l.p), unit_cost: Number(full.cost) || 0 }; });
    const total = items.reduce((t, i) => t + i.qty * i.unit_price, 0);
    (L.orders = L.orders || []).unshift({ id: crypto.randomUUID(), company_id: L.company.id, code, campaign_id: camp ? camp.id : null, customer_id: cust.id, customer_name: name, phone: d, notes, items, total, status: 'novo', created_at: new Date().toISOString() });
    localStorage.setItem(LS_DEMO, JSON.stringify(L));
    return { code, total, items: items.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price })) };
  }
  function whatsappText(res, name) {
    const lines = (res.items || []).map(i => `• ${i.qty}x ${i.name}${showPrices() ? ' — ' + brl(i.qty * i.unit_price) : ''}`).join('\n');
    return `Olá! Fiz o pedido *#${res.code}* na loja online:\n${lines}\n${showPrices() ? `*Total: ${brl(res.total)}*\n` : ''}Meu nome: ${name}`;
  }
  function showDone() {
    const { res, name } = S.done, wa = digits(S.data.company.whatsapp);
    const number = wa ? (wa.length <= 11 ? '55' + wa : wa) : '';
    sheet(`<div class="lj-ok"><div class="ico">✓</div><h2>Pedido enviado!</h2><p style="color:var(--muted);margin:6px 0">Recebemos o seu pedido. Vamos falar com você pelo WhatsApp para combinar pagamento e entrega.</p>
      <div class="lj-code">#${esc(res.code)}</div>${showPrices() ? `<div style="font-weight:700;margin-bottom:8px">Total ${brl(res.total)}</div>` : ''}</div>
      <div style="display:grid;gap:10px;margin-top:8px">${number ? `<a class="lj-primary" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${number}?text=${encodeURIComponent(whatsappText(res, name))}">Enviar também pelo WhatsApp</a>` : ''}<button class="lj-ghost" data-a="close">Voltar à loja</button></div>`);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el || !S.data) return; const a = el.dataset.a, id = el.dataset.id;
    if (a === 'scroll') { e.preventDefault(); document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' }); }
    if (a === 'close') closeSheet();
    if (a === 'cart') openCart();
    if (a === 'detail') openDetail(id);
    if (a === 'cat') { S.cat = el.dataset.v; render(); }
    if (a === 'inc' || a === 'inc-close') { S.cart[id] = Math.min(99, (S.cart[id] || 0) + 1); saveCart(); track('cart'); if (a === 'inc-close') closeSheet(); render(); if (el.dataset.keep) openCart(); }
    if (a === 'dec') { S.cart[id] = Math.max(0, (S.cart[id] || 0) - 1); if (!S.cart[id]) delete S.cart[id]; saveCart(); render(); if (el.dataset.keep) openCart(); }
  });
  document.addEventListener('input', e => { if (e.target.dataset?.in === 'q') { S.q = e.target.value; render(true); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  /* ---------- Início ---------- */
  (async function boot() {
    try {
      S.data = await load();
      if (!S.data) { root.innerHTML = `<div class="lj-empty"><div><h2>Loja não encontrada</h2><p>Confira o link ou peça o endereço correto à loja.</p></div></div>`; return; }
      setAccent(); document.title = `${S.data.company.name} · Loja online`;
      render(); track(S.data.campaign ? 'landing' : 'catalog'); if (S.data.campaign) track('catalog');
    } catch (e) { root.innerHTML = `<div class="lj-empty"><div><h2>Ops!</h2><p>${esc(e.message || 'Não foi possível carregar a loja.')}</p></div></div>`; }
  })();
})();

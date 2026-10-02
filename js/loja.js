// Loja online pública do Prumo: identidade da marca, destaques, catálogo, galeria, carrinho e pedido.
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
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();   // busca sem acento
  const maskPhone = v => { const d = digits(v).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
  const waNumber = w => { const n = digits(w); return n ? (n.length <= 11 ? '55' + n : n) : ''; };

  const S = { data: null, cart: {}, q: '', cat: '', sort: 'rel', sb: null, done: null, sending: false, backing: 0, gal: { id: null, i: 0 } };
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
      if (!prods.length) prods = (L.products || []).filter(p => p.active !== false).slice(0, 12);
      const camp = (L.campaigns || []).find(c => c.slug && c.slug === campSlug) || null;
      return {
        company: { name: L.company.name, whatsapp: st.whatsapp, headline: st.headline, about: st.about, accent: st.accent, show_prices: st.show_prices !== false, logo: st.logo_url, instagram: st.instagram, cover: st.cover_url, city: st.city, hours: st.hours, delivery: st.delivery, policy: st.policy, payments: st.payments || [] },
        products: prods.map(p => ({ id: p.id, name: p.name, price: Number(p.price), category: p.category, description: p.description, image: p.image_url, gallery: p.gallery || [], featured: !!p.featured, available: p.is_service || Number(p.stock) > 0 })),
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
  const imgsOf = p => [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])].map(safeUrl).filter(Boolean);
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
  function setMeta() {
    const c = S.data.company, desc = c.headline || c.about || 'Veja os produtos e faça seu pedido pelo WhatsApp.';
    document.title = `${c.name} · Loja online`;
    const set = (sel, attr, val) => { let el = document.querySelector(sel); if (!el) { el = document.createElement('meta'); const m = sel.match(/\[(name|property)="([^"]+)"\]/); el.setAttribute(m[1], m[2]); document.head.appendChild(el); } el.setAttribute(attr, val); };
    set('meta[name="description"]', 'content', desc.slice(0, 160));
    set('meta[property="og:title"]', 'content', `${c.name} · Loja online`); set('meta[property="og:description"]', 'content', desc.slice(0, 160));
    const img = safeUrl(c.cover) || safeUrl(c.logo); if (img && !img.startsWith('data:')) set('meta[property="og:image"]', 'content', img);
  }

  /* ---------- Telas ---------- */
  function header() {
    const c = S.data.company, logo = safeUrl(c.logo), n = cartCount();
    return `<header class="lj-top"><div class="lj-top-in"><div class="lj-mini-logo">${logo ? `<img src="${esc(logo)}" alt="">` : esc((c.name || 'L')[0].toUpperCase())}</div><div class="lj-name">${esc(c.name)}</div>
      <button class="lj-cart-btn" data-a="cart" aria-label="Ver pedido"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.5h11L21 7H6"/></svg>${n ? `<b>${n}</b>` : ''}</button></div></header>`;
  }
  function identity() {
    const c = S.data.company, logo = safeUrl(c.logo), cover = safeUrl(c.cover), pays = (c.payments || []).filter(Boolean), wa = waNumber(c.whatsapp);
    const facts = [c.city ? `📍 ${esc(c.city)}` : '', c.hours ? `🕒 ${esc(c.hours)}` : '', c.delivery ? '🚚 Entrega e retirada' : '', pays.length ? `💳 ${pays.slice(0, 3).map(esc).join(' · ')}${pays.length > 3 ? '…' : ''}` : ''].filter(Boolean);
    const ig = (c.instagram || '').replace(/^@/, '');
    return `<div class="lj-cover">${cover ? `<img src="${esc(cover)}" alt="">` : ''}</div>
      <div class="lj-id"><div class="lj-id-card"><div class="lj-logo">${logo ? `<img src="${esc(logo)}" alt="Logotipo de ${esc(c.name)}">` : esc((c.name || 'L')[0].toUpperCase())}</div>
        <h1>${esc(c.name)}</h1>${c.headline ? `<p class="lj-tag">${esc(c.headline)}</p>` : ''}
        ${facts.length ? `<div class="lj-facts">${facts.map(f => `<span class="lj-fact">${f}</span>`).join('')}</div>` : ''}
        <div class="lj-actions">${wa ? `<a class="lj-btn wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent('Olá! Vim pela loja online e gostaria de ajuda.')}">Falar no WhatsApp</a>` : ''}${ig ? `<a class="lj-btn" target="_blank" rel="noopener" href="https://instagram.com/${esc(ig)}">Instagram</a>` : ''}<a class="lj-btn dark" href="#produtos" data-a="scroll">Ver produtos</a></div></div></div>`;
  }
  function hero() {
    const c = S.data.campaign; if (!c) return '';
    const L = c.landing || {}, img = safeUrl(L.image), bullets = (L.bullets || []).filter(Boolean).slice(0, 5);
    let left = '';
    if (c.ends_at) { const d = Math.round((new Date(c.ends_at + 'T23:59:59') - new Date()) / 86400000); left = d <= 0 ? 'Último dia!' : d === 1 ? 'Termina amanhã' : `Termina em ${d} dias`; }
    return `<section class="lj-hero ${img ? 'has-img' : ''}">${img ? `<img class="lj-hero-img" src="${esc(img)}" alt="">` : ''}<div class="lj-hero-body">
      <span class="lj-badge">${left ? '⏳ ' + esc(left) : 'Oferta especial'}</span>
      <h2>${esc(L.headline || c.name)}</h2>${L.subheadline ? `<p>${esc(L.subheadline)}</p>` : ''}
      ${bullets.length ? `<ul class="lj-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      <a class="lj-cta" href="#produtos" data-a="scroll">${esc(L.cta || 'Ver produtos')} →</a>${c.ends_at ? `<div class="lj-count">Válido até ${esc(c.ends_at.split('-').reverse().join('/'))}</div>` : ''}</div></section>`;
  }
  function photo(p) {
    const imgs = imgsOf(p);
    return `<div class="lj-photo ${imgs.length ? '' : 'noimg'}" data-a="detail" data-id="${p.id}">${imgs.length ? `<img loading="lazy" src="${esc(imgs[0])}" alt="${esc(p.name)}">` : `<span class="lj-ph">${esc((p.name || '?')[0].toUpperCase())}</span>`}${imgs.length > 1 ? `<span class="lj-multi">📷 ${imgs.length}</span>` : ''}</div>`;
  }
  function card(p, flag) {
    const qty = S.cart[p.id] || 0, off = campOffer(), isOff = off && off.id === p.id;
    return `<article class="lj-card">${isOff ? '<span class="lj-tagc">Oferta</span>' : (flag || p.featured) ? '<span class="lj-tagc star">★ Destaque</span>' : ''}${photo(p)}
      <div class="lj-info">${p.category ? `<div class="lj-cat">${esc(p.category)}</div>` : ''}<div class="lj-pname" data-a="detail" data-id="${p.id}">${esc(p.name)}</div>
      <div class="lj-price">${money(priceOf(p))}${isOff && showPrices() && Number(p.price) > priceOf(p) ? `<span class="lj-old">${brl(p.price)}</span>` : ''}</div>
      ${!p.available ? '<button class="lj-add" disabled>Indisponível</button>'
        : qty ? `<div class="lj-step"><button data-a="dec" data-id="${p.id}" aria-label="Menos">−</button><span>${qty}</span><button data-a="inc" data-id="${p.id}" aria-label="Mais">+</button></div>`
          : `<button class="lj-add" data-a="inc" data-id="${p.id}">Adicionar</button>`}</div></article>`;
  }
  const sorters = { rel: (a, b) => (b.featured - a.featured) || a.name.localeCompare(b.name), asc: (a, b) => priceOf(a) - priceOf(b), desc: (a, b) => priceOf(b) - priceOf(a), nome: (a, b) => a.name.localeCompare(b.name) };
  function catalog() {
    const all = S.data.products, q = norm(S.q.trim()), off = campOffer();
    const counts = {}; all.forEach(p => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
    const cats = Object.keys(counts).sort();
    let list = all.filter(p => (!S.cat || p.category === S.cat) && (!q || norm(p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).includes(q)));
    list = [...list].sort(S.sort === 'rel' && off ? (a, b) => ((b.id === off.id) - (a.id === off.id)) || sorters.rel(a, b) : sorters[S.sort]);
    const feat = all.filter(p => p.featured && p.available).slice(0, 8), showFeat = feat.length >= 2 && !q && !S.cat && S.sort === 'rel';
    return `${showFeat ? `<section class="lj-section"><h2>★ Destaques</h2><div class="lj-feat">${feat.map(p => card(p, true)).join('')}</div></section>` : ''}
      <section class="lj-section" id="produtos"><h2>Produtos <small>${all.length} ${all.length === 1 ? 'item' : 'itens'}</small></h2>
      <div class="lj-tools"><div class="lj-search-row"><input class="lj-search" placeholder="Buscar produto…" data-in="q" value="${esc(S.q)}" aria-label="Buscar produto"><select class="lj-sort" data-in="sort" aria-label="Ordenar"><option value="rel" ${S.sort === 'rel' ? 'selected' : ''}>Relevância</option><option value="asc" ${S.sort === 'asc' ? 'selected' : ''}>Menor preço</option><option value="desc" ${S.sort === 'desc' ? 'selected' : ''}>Maior preço</option><option value="nome" ${S.sort === 'nome' ? 'selected' : ''}>Nome (A–Z)</option></select></div>
        ${cats.length > 1 ? `<div class="lj-cats"><button class="lj-chip ${S.cat ? '' : 'on'}" data-a="cat" data-v="">Todos<span>${all.length}</span></button>${cats.map(c => `<button class="lj-chip ${S.cat === c ? 'on' : ''}" data-a="cat" data-v="${esc(c)}">${esc(c)}<span>${counts[c]}</span></button>`).join('')}</div>` : ''}</div>
      ${(q || S.cat) ? `<div class="lj-count-line">${list.length} ${list.length === 1 ? 'resultado' : 'resultados'}</div>` : '<div style="height:14px"></div>'}
      ${list.length ? `<div class="lj-grid">${list.map(p => card(p)).join('')}</div>` : '<div class="lj-none">Nenhum produto encontrado. Tente outra busca.</div>'}</section>`;
  }
  function infoSections() {
    const c = S.data.company, pays = (c.payments || []).filter(Boolean);
    const cards = [
      c.about ? `<div class="lj-info-card"><h3>Sobre a loja</h3><p>${esc(c.about)}</p></div>` : '',
      c.delivery ? `<div class="lj-info-card"><h3>Entrega e retirada</h3><p>${esc(c.delivery)}</p></div>` : '',
      pays.length ? `<div class="lj-info-card"><h3>Formas de pagamento</h3><div class="lj-pays">${pays.map(p => `<span>${esc(p)}</span>`).join('')}</div></div>` : '',
      c.policy ? `<div class="lj-info-card"><h3>Trocas e devoluções</h3><p>${esc(c.policy)}</p></div>` : '',
      (c.hours || c.city) ? `<div class="lj-info-card"><h3>Atendimento</h3><p>${[c.city ? '📍 ' + esc(c.city) : '', c.hours ? '🕒 ' + esc(c.hours) : ''].filter(Boolean).join('\n')}</p></div>` : ''
    ].filter(Boolean);
    return `<section class="lj-section"><h2>Como comprar</h2><div class="lj-steps">
      <div class="lj-step-card"><b>1</b><div><strong>Escolha</strong><p>Adicione os produtos ao pedido.</p></div></div>
      <div class="lj-step-card"><b>2</b><div><strong>Envie o pedido</strong><p>Informe nome e WhatsApp. É rápido, sem cadastro.</p></div></div>
      <div class="lj-step-card"><b>3</b><div><strong>Combine pelo WhatsApp</strong><p>A loja confirma, e você combina pagamento e entrega.</p></div></div></div></section>
      ${cards.length ? `<section class="lj-section"><h2>Informações da loja</h2><div class="lj-infos">${cards.join('')}</div></section>` : ''}`;
  }
  function render(keepFocus) {
    if (!S.data) return;
    const n = cartCount(), c = S.data.company, wa = waNumber(c.whatsapp);
    const active = keepFocus && document.activeElement && document.activeElement.dataset.in === 'q' ? document.activeElement.selectionStart : null;
    const y = window.scrollY;
    root.innerHTML = `${header()}${identity()}<main class="lj-wrap">${hero()}${catalog()}${infoSections()}</main>
      <footer class="lj-foot">${esc(c.name)}${c.city ? ' · ' + esc(c.city) : ''}<br>Seus dados são usados só para atender o pedido (LGPD) · Loja feita com <a href="https://chausselicita-lang.github.io/prumo/" target="_blank" rel="noopener">Prumo</a></footer>
      ${wa ? `<a class="lj-fab ${n ? '' : 'low'}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp" href="https://wa.me/${wa}?text=${encodeURIComponent('Olá! Vim pela loja online e gostaria de ajuda.')}"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.8-4.6-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.4.6c-.1.2-.3.3-.1.6.6 1 1.4 1.8 2.4 2.3.3.2.5.1.7-.1l.7-.9c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.3.1.8-.1 1.4z"/></svg></a>` : ''}
      ${n ? `<button class="lj-bar" data-a="cart"><span>Ver pedido (${n})</span><span>${showPrices() ? brl(cartTotal()) : 'Enviar'}</span></button>` : ''}`;
    if (active !== null) { const i = root.querySelector('[data-in=q]'); i.focus(); i.setSelectionRange(active, active); }
    if (keepFocus) window.scrollTo(0, y);
    markLoaded();
  }
  function markLoaded() { root.querySelectorAll('.lj-photo img').forEach(i => { const ok = () => i.closest('.lj-photo')?.classList.add('ok'); if (i.complete && i.naturalWidth) ok(); else { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); } }); }

  /* ---------- Camadas (detalhe, carrinho, zoom) com o botão "voltar" do celular ---------- */
  function sheet(html) {
    let ov = document.getElementById('lj-ov');
    if (!ov) { ov = document.createElement('div'); ov.className = 'lj-ov'; ov.id = 'lj-ov'; ov.addEventListener('mousedown', e => { if (e.target === ov) closeSheet(); }); document.body.appendChild(ov); document.body.style.overflow = 'hidden'; history.pushState({ lj: 'sheet' }, ''); }
    ov.innerHTML = `<div class="lj-sheet" role="dialog" aria-modal="true">${html}</div>`;
  }
  function closeSheet() { const ov = document.getElementById('lj-ov'); if (!ov) return; ov.remove(); document.body.style.overflow = ''; S.backing++; history.back(); }
  function lightbox(urls, i) {
    closeLightbox(true); let idx = i;
    const lb = document.createElement('div'); lb.className = 'lj-lb'; lb.id = 'lj-lb';
    const paint = () => { lb.innerHTML = `<img src="${esc(urls[idx])}" alt=""><button class="x" aria-label="Fechar">✕</button>${urls.length > 1 ? '<button class="prev" aria-label="Anterior">‹</button><button class="next" aria-label="Próxima">›</button>' : ''}<div class="n">${idx + 1} / ${urls.length}</div>`; };
    paint();
    lb.addEventListener('click', e => { if (e.target.classList.contains('x') || e.target === lb) return closeLightbox(); if (e.target.classList.contains('prev')) { idx = (idx - 1 + urls.length) % urls.length; paint(); } if (e.target.classList.contains('next')) { idx = (idx + 1) % urls.length; paint(); } });
    let x0 = null; lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50 && urls.length > 1) { idx = (idx + (dx < 0 ? 1 : -1) + urls.length) % urls.length; paint(); } x0 = null; }, { passive: true });
    document.body.appendChild(lb); history.pushState({ lj: 'lb' }, '');
  }
  function closeLightbox(silent) { const lb = document.getElementById('lj-lb'); if (!lb) return; lb.remove(); if (!silent) { S.backing++; history.back(); } }
  window.addEventListener('popstate', () => {
    if (S.backing > 0) { S.backing--; return; }
    if (document.getElementById('lj-lb')) { document.getElementById('lj-lb').remove(); return; }
    const ov = document.getElementById('lj-ov'); if (ov) { ov.remove(); document.body.style.overflow = ''; }
  });

  function openDetail(id, keepIdx) {
    const p = S.data.products.find(x => x.id === id); if (!p) return;
    if (!keepIdx) S.gal = { id, i: 0 };
    const imgs = imgsOf(p), off = campOffer(), isOff = off && off.id === p.id, i = Math.min(S.gal.i, Math.max(0, imgs.length - 1)), qty = S.cart[p.id] || 0;
    sheet(`<div class="lj-sheet-head"><h2>${esc(p.name)}</h2><button class="lj-x" data-a="close" aria-label="Fechar">✕</button></div>
      ${imgs.length ? `<div class="lj-gal-main" data-a="zoom" data-id="${p.id}"><img src="${esc(imgs[i])}" alt="${esc(p.name)}"><span class="lj-gal-zoom">🔍 Ampliar</span></div>
        ${imgs.length > 1 ? `<div class="lj-thumbs">${imgs.map((u, k) => `<button class="${k === i ? 'on' : ''}" data-a="thumb" data-id="${p.id}" data-i="${k}" aria-label="Foto ${k + 1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}` : ''}
      ${p.category ? `<div class="lj-cat" style="margin-top:12px">${esc(p.category)}</div>` : ''}
      <div class="lj-detail-price">${money(priceOf(p))}${isOff && showPrices() && Number(p.price) > priceOf(p) ? `<span class="lj-old">${brl(p.price)}</span>` : ''}</div>
      <div style="margin-bottom:10px">${p.available ? '<span class="lj-stock-ok">● Disponível</span>' : '<span class="lj-stock-no">Indisponível no momento</span>'}</div>
      ${p.description ? `<p style="color:var(--muted);white-space:pre-line;margin:0 0 12px">${esc(p.description)}</p>` : ''}
      ${p.available ? (qty ? `<div class="lj-step" style="margin-bottom:10px"><button data-a="dec" data-id="${p.id}" data-detail="1">−</button><span>${qty} no pedido</span><button data-a="inc" data-id="${p.id}" data-detail="1">+</button></div><button class="lj-primary" data-a="cart">Ver pedido</button>` : `<button class="lj-primary" data-a="inc" data-id="${p.id}" data-detail="1">Adicionar ao pedido</button>`) : '<button class="lj-ghost" disabled>Indisponível</button>'}`);
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
      S.cart = {}; saveCart(); S.done = { res, name }; render(); showDone();
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
    const { res, name } = S.done, number = waNumber(S.data.company.whatsapp);
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
    if (a === 'thumb') { S.gal = { id, i: Number(el.dataset.i) }; openDetail(id, true); }
    if (a === 'zoom') { const p = S.data.products.find(x => x.id === id); lightbox(imgsOf(p), S.gal.id === id ? S.gal.i : 0); }
    if (a === 'cat') { S.cat = el.dataset.v; render(); document.getElementById('produtos')?.scrollIntoView(); }
    if (a === 'inc') { S.cart[id] = Math.min(99, (S.cart[id] || 0) + 1); saveCart(); track('cart'); render(true); if (el.dataset.keep) openCart(); if (el.dataset.detail) openDetail(id, true); }
    if (a === 'dec') { S.cart[id] = Math.max(0, (S.cart[id] || 0) - 1); if (!S.cart[id]) delete S.cart[id]; saveCart(); render(true); if (el.dataset.keep) openCart(); if (el.dataset.detail) openDetail(id, true); }
  });
  document.addEventListener('input', e => { if (e.target.dataset?.in === 'q') { S.q = e.target.value; render(true); } });
  document.addEventListener('change', e => { if (e.target.dataset?.in === 'sort') { S.sort = e.target.value; render(true); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.getElementById('lj-lb')) closeLightbox(); else closeSheet(); } });

  /* ---------- Início ---------- */
  (async function boot() {
    try {
      S.data = await load();
      if (!S.data) { root.innerHTML = `<div class="lj-empty"><div><h2>Loja não encontrada</h2><p>Confira o link ou peça o endereço correto à loja.</p></div></div>`; return; }
      setAccent(); setMeta(); render(); track(S.data.campaign ? 'landing' : 'catalog'); if (S.data.campaign) track('catalog');
    } catch (e) { root.innerHTML = `<div class="lj-empty"><div><h2>Ops!</h2><p>${esc(e.message || 'Não foi possível carregar a loja.')}</p></div></div>`; }
  })();
})();

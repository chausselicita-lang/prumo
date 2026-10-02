// Camada de dados do Prumo: Supabase (nuvem) ou localStorage (demonstração).
window.PE = window.PE || {};

/* ---------------- Utilitários ---------------- */
PE.u = {
  uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2)); },
  brl(n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
  brl0(n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); },
  pct(n, d = 1) { return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'; },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  iso(d) { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); },
  today() { return PE.u.iso(new Date()); },
  addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return PE.u.iso(d); },
  daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); },
  fmtDate(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; },
  fmtShort(iso) { if (!iso) return '—'; const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; },
  initials(name) { return (name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase(); },
  num(v) { if (typeof v === 'number') return v; const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; },
  digits(s) { return String(s || '').replace(/\D/g, ''); }
};

/* ---------------- Camada de dados ---------------- */
const TABLES = ['customers', 'opportunities', 'products', 'sales', 'transactions', 'tasks', 'stock_movements', 'notifications', 'consultations', 'campaigns', 'members', 'invites', 'automations', 'orders', 'store_events'];
// Tabelas "opcionais": se ainda não existirem no banco, o app continua funcionando com lista vazia.
const CORE_TABLES = ['customers', 'opportunities', 'products', 'sales', 'transactions', 'tasks'];
const LS_KEY = 'prumo_demo_v1';

PE.state = { company: null, ...Object.fromEntries(TABLES.map(t => [t, []])) };

PE.db = {
  mode: 'demo',
  sb: null,
  user: null,

  async init() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = PE.config;
    if (SUPABASE_ANON_KEY && window.supabase) {
      this.mode = 'cloud';
      this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data } = await this.sb.auth.getSession();
      this.user = data.session ? data.session.user : null;
      this.sb.auth.onAuthStateChange((_e, session) => { this.user = session ? session.user : null; });
    } else {
      this.mode = 'demo';
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { try { this._local = JSON.parse(raw); } catch { this._local = null; } }
      this._local = this._local || { user: null, company: null, ...Object.fromEntries(TABLES.map(t => [t, []])) };
      this.user = this._local.user;
    }
    return this.user;
  },

  _persist() { if (this.mode === 'demo') localStorage.setItem(LS_KEY, JSON.stringify(this._local)); },

  /* ----- Autenticação ----- */
  async signIn(email, password) {
    if (this.mode === 'demo') return this.demoLogin(email);
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user; return data.user;
  },
  async signUp(email, password, name) {
    if (this.mode === 'demo') return this.demoLogin(email, name);
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
    // Supabase não avisa quando o e-mail já existe (evita vazar contas): vem sem identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
    if (!data.session) { const e = new Error('Enviamos um link de confirmação para o seu e-mail. Confirme e entre.'); e.needsConfirm = true; throw e; }
    this.user = data.user; return data.user;
  },
  async resetPassword(email) {
    if (this.mode === 'demo') throw new Error('Recuperação de senha só funciona com o Supabase conectado.');
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    if (error) throw error;
  },
  async resendConfirmation(email) {
    if (this.mode === 'demo') return;
    const { error } = await this.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.href.split('#')[0] } });
    if (error) throw error;
  },
  demoLogin(email, name) {
    this.user = { id: 'demo-user', email: email || 'demo@prumo.app', user_metadata: { name: name || '' } };
    this._local.user = this.user; this._persist(); return this.user;
  },
  async signOut() {
    if (this.mode === 'cloud') await this.sb.auth.signOut();
    else { this._local.user = null; this._persist(); }
    this.user = null; PE.state.company = null;
  },
  resetDemo() { localStorage.removeItem(LS_KEY); },

  /* ----- Carga inicial ----- */
  async loadAll() {
    const S = PE.state;
    if (this.mode === 'demo') {
      S.company = this._local.company;
      TABLES.forEach(t => { S[t] = this._local[t] || []; });
      if (S.company && !S.members.length) {
        const u = this.user || {};
        S.members = this._local.members = [{ id: 'demo-member', company_id: S.company.id, user_id: u.id, role: 'administrador', name: S.company.owner_name || u.user_metadata?.name || (u.email || '').split('@')[0], email: u.email, monthly_goal: null, created_at: new Date().toISOString() }];
        this._persist();
      }
      return S;
    }
    await this.sb.rpc('pe_accept_invites').then(() => {}, () => {});
    const { data: comps, error } = await this.sb.from('pe_companies').select('*').order('created_at').limit(1);
    if (error) throw error;
    S.company = comps && comps[0] ? comps[0] : null;
    if (!S.company) { TABLES.forEach(t => { S[t] = []; }); return S; }
    const results = await Promise.all(TABLES.map(t =>
      this.sb.from('pe_' + t).select('*').eq('company_id', S.company.id).order('created_at', { ascending: false }).limit(5000)));
    results.forEach((r, i) => {
      if (r.error && CORE_TABLES.includes(TABLES[i]) && !/permission|policy/i.test(r.error.message)) throw r.error;
      if (r.error) console.warn('Tabela opcional indisponível:', TABLES[i], r.error.message);
      S[TABLES[i]] = r.error ? [] : (r.data || []);
    });
    return S;
  },

  /* ----- Imagens: reduz no navegador e envia ao Storage (nuvem) ou guarda embutida (demo) ----- */
  async resizeImage(file, max, quality) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Não foi possível ler a imagem.')); i.src = url; });
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(ok => c.toBlob(ok, 'image/jpeg', quality));
    } finally { URL.revokeObjectURL(url); }
  },
  async uploadImage(file, folder, max = 900) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Escolha um arquivo de imagem.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 15 MB).');
    if (this.mode === 'demo') {
      const blob = await this.resizeImage(file, Math.min(max, 480), 0.7);
      return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    }
    const blob = await this.resizeImage(file, max, 0.82);
    const path = `${PE.state.company.id}/${folder}/${PE.u.uid()}.jpg`;
    const { error } = await this.sb.storage.from('pe-media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw new Error('Não foi possível enviar a imagem: ' + error.message);
    return this.sb.storage.from('pe-media').getPublicUrl(path).data.publicUrl;
  },
  /** Busca pedidos novos da loja (a loja pública grava direto no banco). */
  async refreshOrders() {
    if (this.mode !== 'cloud' || !PE.state.company) return 0;
    const { data, error } = await this.sb.from('pe_orders').select('*').eq('company_id', PE.state.company.id).order('created_at', { ascending: false }).limit(500);
    if (error) return 0;
    const known = new Set(PE.state.orders.map(o => o.id));
    const fresh = (data || []).filter(o => !known.has(o.id));
    PE.state.orders = data || [];
    return fresh.length;
  },

  /* ----- Empresa ----- */
  async saveCompany(patch) {
    const S = PE.state;
    if (this.mode === 'demo') {
      S.company = { id: S.company?.id || 'demo-company', owner_id: 'demo-user', created_at: new Date().toISOString(), ...S.company, ...patch };
      this._local.company = S.company; this._persist(); return S.company;
    }
    if (S.company) {
      const { data, error } = await this.sb.from('pe_companies').update(patch).eq('id', S.company.id).select().single();
      if (error) throw error; S.company = data; return data;
    }
    const { data, error } = await this.sb.from('pe_companies').insert(patch).select().single();
    if (error) throw error; S.company = data; return data;
  },

  /* ----- CRUD genérico (isolado por company_id) ----- */
  async insert(table, row) {
    const S = PE.state; const payload = { ...row, company_id: S.company.id };
    if (this.mode === 'demo') {
      const rec = { id: PE.u.uid(), created_at: new Date().toISOString(), ...payload };
      S[table].unshift(rec); this._local[table] = S[table]; this._persist(); return rec;
    }
    const { data, error } = await this.sb.from('pe_' + table).insert(payload).select().single();
    if (error) throw error; S[table].unshift(data); return data;
  },
  async update(table, id, patch) {
    const S = PE.state; const i = S[table].findIndex(r => r.id === id);
    if (this.mode === 'demo') {
      S[table][i] = { ...S[table][i], ...patch }; this._local[table] = S[table]; this._persist(); return S[table][i];
    }
    const { data, error } = await this.sb.from('pe_' + table).update(patch).eq('id', id).select().single();
    if (error) throw error; if (i >= 0) S[table][i] = data; return data;
  },
  async remove(table, id) {
    const S = PE.state;
    if (this.mode === 'cloud') { const { error } = await this.sb.from('pe_' + table).delete().eq('id', id); if (error) throw error; }
    S[table] = S[table].filter(r => r.id !== id);
    if (this.mode === 'demo') { this._local[table] = S[table]; this._persist(); }
  }
};

/* ---------------- Ações de negócio (mexem em várias tabelas) ---------------- */
PE.actions = {
  /** Registra venda: grava venda, baixa estoque, gera lançamento no financeiro. */
  async registerSale({ customer_id, sold_at, payment_method, status, discount, items, notes, due_date }) {
    const S = PE.state;
    const gross = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
    const total = Math.max(0, gross - (discount || 0));
    const cost_total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
    const sale = await PE.db.insert('sales', {
      customer_id: customer_id || null, sold_at, payment_method, status, discount: discount || 0,
      total, cost_total, items, notes: notes || null, created_by: PE.db.user?.id || null
    });
    if (PE.db.mode === 'cloud') {
      const rows = items.map(i => ({ company_id: S.company.id, sale_id: sale.id, product_id: i.product_id || null, name: i.name, quantity: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost }));
      if (rows.length) await PE.db.sb.from('pe_sale_items').insert(rows);
    }
    for (const it of items) {
      const p = S.products.find(x => x.id === it.product_id);
      if (p && !p.is_service) {
        await PE.db.update('products', p.id, { stock: Number(p.stock) - it.qty });
        await PE.db.insert('stock_movements', { product_id: p.id, kind: 'saida', quantity: it.qty, reason: 'Venda', ref_sale_id: sale.id });
      }
    }
    const cust = S.customers.find(c => c.id === customer_id);
    await PE.db.insert('transactions', {
      kind: 'receita', description: `Venda${cust ? ' — ' + cust.name : ''}`, category: 'Vendas', amount: total,
      due_date: status === 'paga' ? sold_at : (due_date || sold_at), paid_date: status === 'paga' ? sold_at : null,
      customer_id: customer_id || null, sale_id: sale.id, recurrence: 'nenhuma'
    });
    // Automações: dispara o evento "cliente comprou" e reavalia condições (ex.: estoque baixo)
    PE.auto?.emit('venda_registrada', { sale, customer: cust, valor: total }).then(() => PE.auto.runScan(true)).catch(() => {});
    return sale;
  },

  /** Marca lançamento como pago/recebido; recorrentes geram o próximo. */
  async settle(tx, date) {
    await PE.db.update('transactions', tx.id, { paid_date: date || PE.u.today() });
    if (tx.recurrence && tx.recurrence !== 'nenhuma') {
      const d = new Date(tx.due_date + 'T12:00:00');
      if (tx.recurrence === 'mensal') d.setMonth(d.getMonth() + 1);
      else if (tx.recurrence === 'semanal') d.setDate(d.getDate() + 7);
      else if (tx.recurrence === 'anual') d.setFullYear(d.getFullYear() + 1);
      await PE.db.insert('transactions', { kind: tx.kind, description: tx.description, category: tx.category, cost_center: tx.cost_center, amount: tx.amount, due_date: PE.u.iso(d), paid_date: null, recurrence: tx.recurrence });
    }
  },

  /** Registra um marcador em pe_notifications (envio de WhatsApp, adiar, dispensar). Recria a linha para manter created_at = data do contato. */
  async mark(key, days) {
    for (const n of PE.state.notifications.filter(x => x.alert_key === key)) await PE.db.remove('notifications', n.id);
    return PE.db.insert('notifications', { alert_key: key, dismissed_until: PE.u.addDays(PE.u.today(), days) });
  },

  async adjustStock(product, kind, quantity, reason) {
    const q = Number(quantity);
    const next = kind === 'entrada' ? Number(product.stock) + q : kind === 'saida' ? Number(product.stock) - q : q;
    await PE.db.update('products', product.id, { stock: next });
    await PE.db.insert('stock_movements', { product_id: product.id, kind, quantity: q, reason: reason || null });
  },

  /** Dados de exemplo para conhecer a plataforma (modo demo ou empresa nova). */
  async loadSampleData() {
    const S = PE.state; const T = PE.u.today(); const ago = n => PE.u.addDays(T, -n);
    if (!Number(S.company.opening_balance)) await PE.db.saveCompany({ opening_balance: 4500 });
    const prods = [
      ['Camiseta Básica', 'CAM-01', 'Roupas', 22, 59.9, 3, 60, 10],
      ['Calça Jeans', 'CAL-02', 'Roupas', 58, 139.9, 3, 30, 6],
      ['Vestido Floral', 'VES-03', 'Roupas', 47, 119.9, 3, 6, 5],
      ['Tênis Casual', 'TEN-04', 'Calçados', 95, 189.9, 4, 20, 4],
      ['Boné Aba Reta', 'BON-05', 'Acessórios', 18, 39.9, 3, 40, 8],
      ['Jaqueta de Inverno', 'JAQ-06', 'Roupas', 120, 199, 3, 12, 3],
      ['Cinto de Couro', 'CIN-07', 'Acessórios', 26, 49, 3, 25, 4],
      ['Meias (par)', 'MEI-08', 'Acessórios', 4, 12.9, 3, 80, 20]
    ];
    const P = [];
    for (const [name, sku, category, cost, price, fee_pct, stock, min_stock] of prods)
      P.push(await PE.db.insert('products', { name, sku, category, cost, price, fee_pct, stock, min_stock, is_service: false, active: true, published: true }));
    const cs = [
      ['Marina Souza', '(11) 98811-2233', 'Instagram', 'São Paulo', 5], ['João Batista', '(11) 97722-1100', 'Indicação', 'Osasco', 12],
      ['Carla Mendes', '(11) 96633-4455', 'WhatsApp', 'São Paulo', 2], ['Rafael Lima', '(21) 98877-6655', 'Loja física', 'Rio de Janeiro', 20],
      ['Patrícia Alves', '(11) 95544-3322', 'Instagram', 'Guarulhos', null], ['Lucas Prado', '(31) 99123-8899', 'Site', 'Belo Horizonte', 40],
      ['Fernanda Rocha', '(11) 91234-5678', 'Indicação', 'São Paulo', 60], ['Bruno Teixeira', '(11) 93456-7890', 'WhatsApp', 'Santo André', 8]
    ];
    const C = [];
    for (const [name, phone, origin, city, bd] of cs)
      C.push(await PE.db.insert('customers', { name, phone, whatsapp: phone, email: null, city, origin, birthday: bd != null ? PE.u.addDays(T, bd).replace(/^\d{4}/, '1990') : null, notes: null }));
    // Vendas espalhadas nos últimos 75 dias (mais recentes puxam para cima)
    const plan = [
      [1, 0, [[0, 2]], 'paga'], [2, 1, [[1, 1], [4, 1]], 'paga'], [4, 2, [[3, 1]], 'paga'], [6, 3, [[0, 3], [7, 4]], 'paga'],
      [8, 0, [[2, 1]], 'paga'], [10, 4, [[5, 1]], 'a_receber'], [13, 7, [[0, 1], [4, 2]], 'paga'], [16, 1, [[1, 2]], 'paga'],
      [19, 2, [[6, 1], [7, 3]], 'paga'], [23, 0, [[3, 1]], 'paga'], [27, 5, [[0, 2]], 'paga'], [33, 3, [[1, 1]], 'paga'],
      [38, 1, [[0, 4]], 'paga'], [44, 2, [[4, 2]], 'paga'], [52, 0, [[2, 1], [6, 1]], 'paga'], [58, 3, [[5, 1]], 'paga'],
      [66, 6, [[1, 1]], 'paga'], [74, 5, [[0, 2]], 'paga']
    ];
    for (const [d, ci, its, status] of plan) {
      const items = its.map(([pi, q]) => ({ product_id: P[pi].id, name: P[pi].name, qty: d <= 30 ? q * 3 : q, unit_price: Number(P[pi].price), unit_cost: Number(P[pi].cost) }));
      await PE.actions.registerSale({ customer_id: C[ci].id, sold_at: ago(d), payment_method: 'Pix', status, discount: 0, items, due_date: PE.u.addDays(ago(d), 5) });
    }
    // Ajuste: produtos parados (Jaqueta e Cinto sem venda recente)
    const fin = [
      ['despesa', 'Aluguel da loja', 'Aluguel', 2400, 5, 'mensal', true], ['despesa', 'Internet e telefone', 'Contas fixas', 180, 8, 'mensal', true],
      ['despesa', 'Fornecedor — reposição', 'Compra de mercadoria', 1900, 3, 'nenhuma', false], ['despesa', 'Energia elétrica', 'Contas fixas', 340, 2, 'mensal', false],
      ['despesa', 'Marketing — Instagram Ads', 'Marketing', 250, 14, 'mensal', true], ['despesa', 'Contador', 'Serviços', 220, 12, 'mensal', true],
      ['receita', 'Encomenda corporativa (uniformes)', 'Vendas', 1350, 6, 'nenhuma', false]
    ];
    for (const [kind, description, category, amount, dueOffset, recurrence, paid] of fin) {
      const due = paid ? ago(dueOffset) : PE.u.addDays(T, dueOffset);
      await PE.db.insert('transactions', { kind, description, category, amount, due_date: due, paid_date: paid ? due : null, recurrence });
    }
    await PE.db.insert('opportunities', { customer_id: C[4].id, title: 'Enxoval de inverno', value: 650, stage: 'proposta', next_action: 'Cobrar resposta do orçamento', next_action_date: T });
    await PE.db.insert('opportunities', { customer_id: C[7].id, title: 'Kit uniforme equipe', value: 1800, stage: 'negociacao', next_action: 'Enviar novas condições', next_action_date: PE.u.addDays(T, 2) });
    await PE.db.insert('opportunities', { customer_id: null, title: 'Lead do Instagram — vestidos', value: 240, stage: 'novo', next_action: 'Responder no direct', next_action_date: T });
    const jaq = P[5], ends = PE.u.addDays(T, 7), price = PE.engine.mk.promoPrice(S, jaq);
    const gen = PE.engine.mk.generate(S, { objective: 'estoque', product: jaq, price, audience: 'ativos', channel: 'WhatsApp', starts: T, ends });
    await PE.db.insert('campaigns', { name: gen.name, objective: 'estoque', audience: 'ativos', product_id: jaq.id, price, message: gen.message, caption: gen.caption, channel: 'WhatsApp', status: 'ativa', starts_at: T, ends_at: ends, slug: 'queima-jaqueta', landing: gen.landing });
    if (!S.company.slug) await PE.db.saveCompany({ slug: 'loja-exemplo', store_enabled: true, store_settings: { whatsapp: '11999990000', headline: 'Moda com preço justo e entrega rápida', about: 'Peças selecionadas para todos os estilos. Peça pelo site e finalize pelo WhatsApp.', accent: '#f97316', show_prices: true } });
    await PE.db.insert('tasks', { title: 'Repor estoque de vestidos', category: 'estoque', priority: 'alta', status: 'aberta', due_date: PE.u.addDays(T, 1) });
    await PE.db.insert('tasks', { title: 'Postar promoção de fim de semana', category: 'marketing', priority: 'media', status: 'aberta', due_date: PE.u.addDays(T, 3) });
    await PE.db.insert('tasks', { title: 'Conferir maquininha de cartão', category: 'financeiro', priority: 'baixa', status: 'aberta', due_date: ago(1) });
    // Ajusta datas dos movimentos para o histórico e do estoque dos parados
    return true;
  }
};

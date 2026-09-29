// Prumo — aplicação: autenticação, onboarding, navegação e telas do MVP.
(function () {
  const S = PE.state, U = PE.u, E = PE.engine, UI = PE.ui, esc = U.esc, A = UI.acts;
  const root = document.getElementById('app');
  const CATS_DESP = ['Aluguel', 'Contas fixas', 'Compra de mercadoria', 'Marketing', 'Salários', 'Impostos', 'Serviços', 'Transporte', 'Outros'];
  const CATS_REC = ['Vendas', 'Serviços', 'Outros'];
  const PAY = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência', 'Fiado'];
  const STAGES = [['novo', 'Novo lead'], ['contato', 'Contato'], ['negociacao', 'Negociação'], ['proposta', 'Proposta'], ['venda', 'Venda'], ['posvenda', 'Pós-venda']];
  const NAV = [
    ['dashboard', 'Início', 'home'], ['clientes', 'Clientes e oportunidades', 'users'], ['vendas', 'Vendas', 'cart'], ['lembretes', 'Lembretes WhatsApp', 'chat'], ['marketing', 'Marketing', 'megaphone'], ['automacoes', 'Automações', 'bolt'],
    ['financeiro', 'Financeiro', 'wallet'], ['produtos', 'Produtos', 'box'], ['precificacao', 'Precificação', 'calc'],
    ['tarefas', 'Tarefas', 'check'], ['equipe', 'Equipe e permissões', 'users'], ['atencao', 'Atenção', 'bell'], ['consultor', 'Consultor', 'spark'], ['configuracoes', 'Configurações', 'gear']
  ];
  const tabs = { clientes: 'clientes', financeiro: 'resumo' };
  let view = 'dashboard';
  const session = { chat: [] };

  const per = () => E.period(UI.range, UI.custom);
  const custName = id => S.customers.find(c => c.id === id)?.name || null;
  const firstName = () => (S.company?.owner_name || PE.db.user?.user_metadata?.name || (PE.db.user?.email || '').split('@')[0] || 'empreendedor').split(' ')[0];

  /* =====================================================================
     AUTENTICAÇÃO
  ===================================================================== */
  function renderAuth(mode = 'login') {
    const demo = PE.db.mode === 'demo';
    root.innerHTML = `<div class="auth-wrap">
      <div class="auth-hero">
        <div class="brand"><span class="logo">P</span><span>Prumo<small>o copiloto do pequeno negócio</small></span></div>
        <div><h1>Seu negócio inteiro em um só lugar.</h1><p>Venda mais, organize sua empresa, acompanhe seu dinheiro e descubra o que precisa da sua atenção.</p></div>
        <p class="small" style="position:relative;z-index:1">Cada empresa tem seus dados totalmente isolados e protegidos.</p>
      </div>
      <div class="auth-card"><form class="box" id="auth-form" novalidate>
        <div><h2>${mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar sua conta' : 'Recuperar senha'}</h2>
        <p class="muted small" style="margin-top:6px">${mode === 'login' ? 'Bem-vindo de volta.' : mode === 'signup' ? 'Leva menos de 2 minutos.' : 'Enviaremos um link para o seu e-mail.'}</p></div>
        ${demo ? `<div class="alert info"><span class="dot"></span><div><div class="a-title">Modo demonstração</div><div class="a-detail">Supabase ainda não conectado: seus dados ficam só neste navegador. Qualquer e-mail funciona.</div></div></div>` : ''}
        ${mode === 'signup' ? `<div class="field"><label>Seu nome</label><input class="input" name="name" autocomplete="name" required></div>` : ''}
        <div class="field"><label>E-mail</label><input class="input" type="email" name="email" autocomplete="email" required></div>
        ${mode !== 'reset' ? `<div class="field"><label>Senha</label><input class="input" type="password" name="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" ${demo ? '' : 'required'}></div>` : ''}
        <button class="btn primary lg" type="submit">${mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}</button>
        <div class="row between small">
          ${mode === 'login' ? `<a href="#" data-act="auth-mode" data-m="signup">Criar conta</a><a href="#" data-act="auth-mode" data-m="reset">Esqueci a senha</a>` : `<a href="#" data-act="auth-mode" data-m="login">← Voltar para entrar</a>`}
        </div>
        <p class="hint">Ao continuar você concorda com o tratamento dos seus dados conforme a LGPD, apenas para operar o serviço.</p>
      </form></div></div>`;
    document.getElementById('auth-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target; const btn = f.querySelector('[type=submit]');
      const email = f.email.value.trim(), pw = f.password?.value || '';
      if (!/^\S+@\S+\.\S+$/.test(email)) return UI.toast('Informe um e-mail válido.', 'err');
      if (mode !== 'reset' && !demo && pw.length < 6) return UI.toast('A senha precisa ter ao menos 6 caracteres.', 'err');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        if (mode === 'reset') { await PE.db.resetPassword(email); UI.toast('Link enviado! Confira seu e-mail.'); renderAuth('login'); return; }
        if (mode === 'signup') await PE.db.signUp(email, pw, f.name.value.trim()); else await PE.db.signIn(email, pw);
        await start();
      } catch (err) {
        if (err.needsConfirm || /not confirmed/i.test(err.message)) return renderConfirm(email);
        const msg = /Invalid login/i.test(err.message) ? 'E-mail ou senha incorretos.'
          : /already registered|already been registered/i.test(err.message) ? 'Este e-mail já tem conta. Use "Entrar".'
          : /rate limit|too many/i.test(err.message) ? 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'
          : err.message;
        UI.toast(msg, 'err'); btn.disabled = false; btn.textContent = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link';
      }
    });
  }
  function renderConfirm(email) {
    root.innerHTML = `<div class="splash"><div class="stack" style="text-align:center;max-width:440px;padding:24px;justify-items:center">
      <div class="avatar orange" style="width:72px;height:72px;font-size:32px;border-radius:24px">✉</div>
      <h1>Confirme seu e-mail</h1>
      <p class="muted">Enviamos um link para <strong>${esc(email)}</strong>. Abra o e-mail, clique no link e volte aqui para entrar.</p>
      <p class="small muted">Não chegou? Olhe a caixa de spam. O envio pode levar alguns minutos.</p>
      <div class="row wrap" style="justify-content:center"><button class="btn primary" data-act="resend-confirm" data-email="${esc(email)}">Reenviar e-mail</button><button class="btn ghost" data-act="auth-mode" data-m="login">Já confirmei, entrar</button></div></div></div>`;
  }
  A['resend-confirm'] = async (d, btn) => UI.run(async () => { await PE.db.resendConfirmation(d.email); UI.toast('E-mail reenviado. Confira também o spam.'); }, btn);
  A['auth-mode'] = d => renderAuth(d.m);

  /* =====================================================================
     ONBOARDING — "Vamos configurar seu negócio."
  ===================================================================== */
  const OB = { step: 0, data: { channels: [] } };
  const OB_TYPES = ['Loja / comércio', 'Prestador de serviços', 'Salão / barbearia', 'Restaurante / lanchonete', 'Oficina', 'Profissional autônomo', 'Negócio digital', 'Outro'];
  const OB_CHANNELS = ['Loja física', 'WhatsApp', 'Instagram', 'Site', 'Marketplace', 'Presencial', 'Outros'];
  const OB_REV = ['Até R$ 5 mil/mês', 'R$ 5 a 20 mil/mês', 'R$ 20 a 60 mil/mês', 'Acima de R$ 60 mil/mês'];
  const OB_EMP = [['0', 'Só eu'], ['2', '1 a 3 pessoas'], ['6', '4 a 9 pessoas'], ['15', '10 ou mais']];

  function renderOnboarding() {
    const steps = 7, s = OB.step, d = OB.data;
    let title, sub, body;
    const choices = (key, list, multi) => `<div class="choice-grid">${list.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; const on = multi ? d[key].includes(v) : d[key] === v; return `<button type="button" class="choice ${on ? 'on' : ''}" data-act="ob-pick" data-k="${key}" data-v="${esc(v)}" data-multi="${multi ? 1 : 0}">${esc(l)}</button>`; }).join('')}</div>`;
    if (s === 0) { title = 'Como se chama a sua empresa?'; sub = 'Pode ser o nome fantasia ou o seu nome.'; body = `<div class="field"><label>Nome da empresa</label><input class="input" id="ob-name" value="${esc(d.name || '')}" placeholder="Ex.: Studio da Marina" autofocus></div><div class="field"><label>Seu nome</label><input class="input" id="ob-owner" value="${esc(d.owner_name || (PE.db.user?.user_metadata?.name || ''))}" placeholder="Como devemos te chamar?"></div>`; }
    if (s === 1) { title = 'Que tipo de negócio você tem?'; sub = 'Isso nos ajuda a falar a sua língua.'; body = choices('business_type', OB_TYPES); }
    if (s === 2) { title = 'O que você vende?'; sub = 'Em poucas palavras. Ex.: roupas femininas, cortes de cabelo, marmitas…'; body = `<div class="field"><label>Produtos ou serviços</label><input class="input" id="ob-sells" value="${esc(d.sells || '')}" placeholder="O que você vende?"></div>`; }
    if (s === 3) { title = 'Como você vende?'; sub = 'Marque todos que usa.'; body = choices('channels', OB_CHANNELS, true); }
    if (s === 4) { title = 'Quanto você fatura por mês, mais ou menos?'; sub = 'Uma estimativa já basta. Não é enviada a ninguém.'; body = choices('revenue_range', OB_REV); }
    if (s === 5) { title = 'Quantas pessoas trabalham com você?'; sub = 'Sem contar você.'; body = choices('employees', OB_EMP); }
    if (s === 6) { title = 'Cadastre seu primeiro produto ou serviço'; sub = 'Opcional — você pode pular e fazer depois.'; body = `<div class="form-grid"><div class="field full"><label>Nome</label><input class="input" id="ob-pname" placeholder="Ex.: Corte masculino"></div><div class="field"><label>Custo (R$)</label><input class="input" id="ob-pcost" type="number" step="0.01" inputmode="decimal" placeholder="0,00"></div><div class="field"><label>Preço de venda (R$)</label><input class="input" id="ob-pprice" type="number" step="0.01" inputmode="decimal" placeholder="0,00"></div></div>`; }
    root.innerHTML = `<div class="auth-wrap"><div class="auth-hero"><div class="brand"><span class="logo">P</span><span>Prumo</span></div><div><h1>Vamos configurar seu negócio.</h1><p>Poucas perguntas. Você começa com o mínimo e o sistema evolui junto com a sua empresa.</p></div><span></span></div>
      <div class="auth-card"><div class="box"><div class="steps">${Array.from({ length: steps }, (_, i) => `<span class="${i <= s ? 'on' : ''}"></span>`).join('')}</div>
      <div><p class="small muted">Etapa ${s + 1} de ${steps}</p><h2 style="margin-top:4px">${title}</h2><p class="muted small" style="margin-top:6px">${sub}</p></div>${body}
      <div class="row between">${s > 0 ? '<button class="btn ghost" data-act="ob-back">Voltar</button>' : '<span></span>'}<button class="btn primary" data-act="ob-next">${s === steps - 1 ? 'Finalizar' : 'Continuar'}</button></div></div></div></div>`;
  }
  A['ob-pick'] = d => { const k = d.k; if (d.multi === '1') { const arr = OB.data[k]; const i = arr.indexOf(d.v); i >= 0 ? arr.splice(i, 1) : arr.push(d.v); } else OB.data[k] = d.v; renderOnboarding(); };
  A['ob-back'] = () => { OB.step = Math.max(0, OB.step - 1); renderOnboarding(); };
  A['ob-next'] = async (_d, btn) => {
    const g = id => document.getElementById(id)?.value.trim();
    const d = OB.data;
    if (OB.step === 0) { d.name = g('ob-name'); d.owner_name = g('ob-owner'); if (!d.name) return UI.toast('Informe o nome da empresa.', 'err'); }
    if (OB.step === 1 && !d.business_type) return UI.toast('Escolha o tipo de negócio.', 'err');
    if (OB.step === 2) d.sells = g('ob-sells');
    if (OB.step === 4 && !d.revenue_range) return UI.toast('Escolha uma faixa de faturamento.', 'err');
    if (OB.step === 5 && d.employees === undefined) return UI.toast('Escolha uma opção.', 'err');
    if (OB.step === 6) {
      await UI.run(async () => {
        await PE.db.saveCompany({ name: d.name, owner_name: d.owner_name || null, business_type: d.business_type, sells: d.sells || null, channels: d.channels, revenue_range: d.revenue_range, employees: Number(d.employees || 0), onboarded: true, target_margin: 30, opening_balance: 0 });
        await PE.db.loadAll();
        const pn = g('ob-pname');
        if (pn) await PE.db.insert('products', { name: pn, cost: Number(g('ob-pcost') || 0), price: Number(g('ob-pprice') || 0), fee_pct: 0, stock: 0, min_stock: 0, is_service: false, active: true });
        renderDone();
      }, btn); return;
    }
    OB.step++; renderOnboarding();
  };
  function renderDone() {
    root.innerHTML = `<div class="splash"><div class="stack" style="text-align:center;max-width:420px;padding:24px;justify-items:center"><div class="avatar orange" style="width:72px;height:72px;font-size:34px;border-radius:24px">✓</div><h1>Sua empresa está pronta.</h1><p class="muted">${esc(S.company.name)} já está configurada. Comece registrando uma venda — ou explore com dados de exemplo.</p><button class="btn primary lg" data-act="ob-finish">Ir para o painel</button><button class="btn ghost" data-act="ob-finish-sample">Explorar com dados de exemplo</button></div></div>`;
  }
  A['ob-finish'] = () => { location.hash = '#/dashboard'; shell(); };
  A['ob-finish-sample'] = async (_d, btn) => { await UI.run(async () => { await PE.actions.loadSampleData(); location.hash = '#/dashboard'; shell(); UI.toast('Dados de exemplo carregados.'); }, btn); };

  /* =====================================================================
     CASCA DO APP
  ===================================================================== */
  function shell() {
    root.innerHTML = `<div class="app">
      <aside class="sidebar"><div class="brand"><span class="logo">P</span><span>Prumo<small>${esc(S.company.name)}</small></span></div>
        ${NAV.filter(n => PE.perm.canModule(n[0])).map(([id, label, ic]) => `${id === 'produtos' || id === 'atencao' ? '<div class="nav-sep"></div>' : ''}<a class="nav-link" href="#/${id}" data-nav="${id}">${UI.ico(ic)}<span>${label}</span>${id === 'atencao' ? '<span class="badge hidden" id="badge-desk"></span>' : id === 'lembretes' ? '<span class="badge hidden" id="badge-lem" style="background:var(--orange)"></span>' : ''}</a>`).join('')}
        <div style="flex:1"></div><a class="nav-link" href="#" data-act="logout">${UI.ico('logout')}<span>Sair</span></a></aside>
      <div class="main"><header class="topbar"><div class="mobile-brand"><span class="logo" style="width:30px;height:30px;border-radius:10px;background:var(--orange);color:#fff;display:grid;place-items:center;font-size:16px">P</span>Prumo</div><div class="muted small grow" id="crumb"></div>
        <div class="row">${PE.db.mode === 'demo' ? `<select class="input" style="width:auto;padding:7px 10px;font-size:13px" data-act-change="demo-role" aria-label="Ver como">${Object.entries(PE.perm.roles).map(([k, r]) => `<option value="${k}" ${k === PE.perm.current() ? 'selected' : ''}>Ver como: ${r.label}</option>`).join('')}</select>` : ''}<button class="btn primary sm" data-act="sale-new">${UI.ico('plus', 16)} Registrar venda</button></div></header>
        <main class="content" id="content"></main></div>
      <nav class="bottom-nav">${[['dashboard', 'Início', 'home'], ['clientes', 'Clientes', 'users'], ['vendas', 'Vendas', 'cart'], ['financeiro', 'Caixa', 'wallet'], ['atencao', 'Atenção', 'bell']].filter(x => PE.perm.canModule(x[0])).map(([id, l, ic]) => `<a href="#/${id}" data-nav="${id}">${UI.ico(ic, 22)}<span>${l}</span>${id === 'atencao' ? '<span class="badge hidden" id="badge-mob"></span>' : ''}</a>`).join('')}<a href="#" data-act="more">${UI.ico('dots', 22)}<span>Mais</span></a></nav></div>`;
    route();
  }
  A['logout'] = async () => { await PE.db.signOut(); renderAuth(); };
  A['more'] = () => UI.modal({ title: 'Mais opções', body: `<div class="list">${NAV.filter(n => !['dashboard', 'clientes', 'vendas', 'financeiro', 'atencao'].includes(n[0]) && PE.perm.canModule(n[0])).map(([id, l, ic]) => `<a class="item clickable" href="#/${id}" data-act="close-modal" style="text-decoration:none">${UI.ico(ic)}<span class="title">${l}</span></a>`).join('')}<a class="item clickable" href="#" data-act="logout" style="text-decoration:none">${UI.ico('logout')}<span class="title">Sair</span></a></div>` });

  function route() {
    if (!S.company) return;
    let h = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    if (!VIEWS[h]) h = 'dashboard';
    if (!PE.perm.canModule(h)) { UI.toast('Seu perfil não tem acesso a esta área.', 'err'); if (location.hash !== '#/dashboard') { location.hash = '#/dashboard'; return; } h = 'dashboard'; }
    view = h;
    refresh();
    window.scrollTo({ top: 0 });
    PE.auto.runScan(false).then(n => { if (n) refresh(); }).catch(() => {});
  }
  function refresh() {
    const c = document.getElementById('content'); if (!c) return;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
    document.getElementById('crumb').textContent = NAV.find(n => n[0] === view)?.[1] || '';
    document.title = `${NAV.find(n => n[0] === view)?.[1] || 'Prumo'} · Prumo`;
    const urgent = E.alerts(S).filter(a => a.level === 'urgent').length;
    const rem = E.reminders(S).length; const bl = document.getElementById('badge-lem'); if (bl) { bl.textContent = rem; bl.classList.toggle('hidden', !rem); }
    ['badge-desk', 'badge-mob'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = urgent; b.classList.toggle('hidden', !urgent); } });
    c.innerHTML = VIEWS[view]();
    applyPerms(document);
  }
  window.addEventListener('hashchange', route);

  /* ---------- Blocos reutilizáveis ---------- */
  function periodBar() {
    const items = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano']];
    return `<div class="filters">${items.map(([k, l]) => `<button class="pill ${UI.range === k ? 'active' : ''}" data-act="range" data-r="${k}">${l}</button>`).join('')}<button class="pill ${UI.range === 'custom' ? 'active' : ''}" data-act="range" data-r="custom">${UI.range === 'custom' && UI.custom ? `${U.fmtShort(UI.custom.start)}–${U.fmtShort(UI.custom.end)}` : 'Personalizado'}</button></div>`;
  }
  A['range'] = d => {
    if (d.r !== 'custom') { UI.range = d.r; return refresh(); }
    UI.form({ title: 'Período personalizado', fields: [{ name: 'start', label: 'De', type: 'date', required: true }, { name: 'end', label: 'Até', type: 'date', required: true }], values: UI.custom || { start: U.addDays(U.today(), -30), end: U.today() }, submitLabel: 'Aplicar', onSubmit: v => { if (v.end < v.start) throw new Error('A data final deve ser depois da inicial.'); UI.range = 'custom'; UI.custom = v; UI.closeModal(); refresh(); } });
  };
  const delta = (d, invert) => d === null ? '<span class="muted">sem comparação</span>' : `<span class="${(d >= 0) !== !!invert ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${U.pct(Math.abs(d), 0)}</span> <span class="muted">vs. anterior</span>`;
  const kpi = (label, value, sub, cls = '') => `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="value num">${value}</div><div class="delta">${sub || ''}</div></div>`;
  const alertHTML = (a, actions = true) => `<div class="alert ${a.level}"><span class="dot"></span><div class="grow"><div class="a-title">${esc(a.title)}</div><div class="a-detail">${esc(a.detail)}</div>${actions ? `<div class="a-actions"><a class="btn sm ghost" href="#/${a.route}">${esc(a.cta || 'Ver')}</a><button class="btn sm ghost" data-act="dismiss-alert" data-key="${esc(a.key)}">Dispensar 7 dias</button></div>` : ''}</div></div>`;
  A['dismiss-alert'] = async d => { await PE.actions.mark(d.key, 7); refresh(); };
  const statusChip = st => { const m = E.statusMeta[st]; return `<span class="chip ${m.cls}">${m.label}</span>`; };
  const marginChip = m => `<span class="chip ${m >= Number(S.company.target_margin || 30) ? 'green' : m >= 10 ? 'yellow' : 'red'}">${U.pct(m, 0)}</span>`;
  const wa = c => { const n = U.digits(c.whatsapp || c.phone); return n ? `https://wa.me/${n.length <= 11 ? '55' + n : n}` : null; };

  /* =====================================================================
     VIEWS
  ===================================================================== */
  const VIEWS = {};

  /* ---------- INÍCIO ---------- */
  const kpiRow = (m, c) => {
    const all = {
      vendas: kpi('Vendas', U.brl0(c.vendas), delta(m.delta('vendas')), 'orange'), receitas: kpi('Receitas', U.brl0(c.receitas), delta(m.delta('receitas')), 'black'),
      despesas: kpi('Despesas', U.brl0(c.despesas), delta(m.delta('despesas'), true)), lucro: kpi('Lucro estimado', U.brl0(c.lucro), delta(m.delta('lucro')), c.lucro >= 0 ? 'green' : 'red'),
      caixa: kpi('Caixa', U.brl0(m.caixa), '<span class="muted">saldo hoje</span>', m.caixa >= 0 ? 'black' : 'red')
    };
    const keys = PE.perm.kpis[PE.perm.current()];
    return keys.length ? `<div class="grid kpis" style="--n:${keys.length}">${keys.map(k => all[k]).join('')}</div>` : '';
  };
  VIEWS.dashboard = () => {
    const p = per(), m = E.metrics(S, p), c = m.cur, hr = new Date().getHours();
    const greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    const alerts = E.alerts(S); const empty = !S.sales.length && !S.customers.length && !S.products.length;
    const today = U.today();
    const todo = [
      ...S.tasks.filter(t => t.status !== 'concluida' && t.due_date && t.due_date <= today).map(t => ({ t: t.title, s: t.due_date < today ? 'Atrasada' : 'Hoje', cls: t.due_date < today ? 'red' : 'orange', r: 'tarefas' })),
      ...S.opportunities.filter(o => o.next_action && o.next_action_date && o.next_action_date <= today && !['venda', 'posvenda', 'perdido'].includes(o.stage)).map(o => ({ t: o.next_action + (custName(o.customer_id) ? ' — ' + custName(o.customer_id) : ''), s: 'Venda', cls: 'blue', r: 'clientes' }))
    ].slice(0, 5);
    return `<div class="page-head"><div><p class="muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>${greet}, ${esc(firstName())}</h1></div>${periodBar()}</div>
    ${empty ? `<div class="card">${UI.empty('🚀', 'Vamos começar?', 'Registre sua primeira venda, cadastre produtos e clientes — ou explore o Prumo com dados de exemplo para ver tudo funcionando.', `<div class="row wrap" style="justify-content:center"><button class="btn primary" data-act="sale-new">Registrar venda</button><button class="btn ghost" data-act="load-sample">Carregar dados de exemplo</button></div>`)}</div>` : ''}
    ${kpiRow(m, c)}
    <div class="grid cols-2" style="grid-template-columns:1.4fr 1fr">
      <div class="card"><div class="card-title"><h2>O que precisa da sua atenção?</h2><a class="small" href="#/atencao">Ver tudo (${alerts.length})</a></div>
        ${alerts.length ? `<div class="list">${alerts.slice(0, 4).map(a => alertHTML(a, false)).join('')}</div>` : UI.empty('🟢', 'Tudo em ordem', 'Nada urgente por enquanto. Continue registrando vendas e contas para o Prumo vigiar por você.')}</div>
      <div class="stack">
        ${PE.perm.kpis[PE.perm.current()].includes('vendas') ? `<div class="card"><div class="card-title"><h2>Vendas no período</h2><span class="chip">${c.qtd} venda${c.qtd === 1 ? '' : 's'}</span></div>${UI.bars(E.salesSeries(S, p))}<p class="small muted" style="margin-top:8px">Ticket médio ${U.brl(c.ticket)} · Margem ${U.pct(c.margem, 0)}</p></div>` : ''}
        <div class="card"><div class="card-title"><h2>Para fazer agora</h2></div>${todo.length ? `<div class="list">${todo.map(x => `<a class="item clickable" href="#/${x.r}" style="text-decoration:none"><span class="chip ${x.cls}">${x.s}</span><span class="grow">${esc(x.t)}</span></a>`).join('')}</div>` : '<p class="muted small">Nenhuma pendência para hoje. 🎉</p>'}</div>
      </div></div>
    <div class="card"><div class="card-title"><h2>Ações rápidas</h2></div><div class="row wrap">
      <button class="btn primary" data-act="sale-new">Registrar venda</button><button class="btn ghost" data-act="cust-new">Adicionar cliente</button>
      <button class="btn ghost" data-act="opp-new">Criar oportunidade</button><button class="btn ghost" data-act="tx-new" data-kind="despesa">Lançar despesa</button><a class="btn soft" href="#/consultor">Perguntar ao Consultor</a></div></div>`;
  };
  A['load-sample'] = async (_d, b) => UI.run(async () => { await PE.actions.loadSampleData(); refresh(); UI.toast('Dados de exemplo carregados.'); }, b);

  /* ---------- CLIENTES E OPORTUNIDADES ---------- */
  let custQuery = '', custFilter = 'todos';
  VIEWS.clientes = () => {
    const tab = tabs.clientes;
    const head = `<div class="page-head"><h1>Clientes e oportunidades</h1><div class="row wrap"><button class="btn primary" data-act="cust-new">${UI.ico('plus', 16)} Adicionar cliente</button><button class="btn ghost" data-act="opp-new">Criar oportunidade</button></div></div>
      <div class="filters"><button class="pill ${tab === 'clientes' ? 'active' : ''}" data-act="tab" data-v="clientes" data-t="clientes">Clientes (${S.customers.length})</button><button class="pill ${tab === 'pipeline' ? 'active' : ''}" data-act="tab" data-v="clientes" data-t="pipeline">Oportunidades (${S.opportunities.filter(o => !['perdido'].includes(o.stage)).length})</button></div>`;
    if (tab === 'pipeline') {
      return head + `<div class="pipeline">${STAGES.map(([k, l]) => { const list = S.opportunities.filter(o => o.stage === k); return `<div class="col"><h4><span>${l}</span><span class="muted">${list.length}${list.length ? ' · ' + U.brl0(list.reduce((s, o) => s + Number(o.value), 0)) : ''}</span></h4>${list.map(o => oppCard(o, k)).join('') || '<p class="small muted" style="padding:6px">Vazio</p>'}</div>`; }).join('')}</div>`;
    }
    const rows = S.customers.map(c => ({ c, st: E.customerStats(S, c) }))
      .filter(x => (custFilter === 'todos' || x.st.status === custFilter) && (!custQuery || (x.c.name + ' ' + (x.c.phone || '') + ' ' + (x.c.city || '')).toLowerCase().includes(custQuery)))
      .sort((a, b) => b.st.total - a.st.total);
    return head + `<div class="row wrap"><input class="input grow" style="min-width:200px" placeholder="Buscar cliente…" data-input="cust-q" value="${esc(custQuery)}"></div>
      <div class="filters">${['todos', 'novo', 'recorrente', 'vip', 'inativo', 'potencial', 'perdido'].map(k => `<button class="pill ${custFilter === k ? 'active' : ''}" data-act="cust-filter" data-k="${k}">${k === 'todos' ? 'Todos' : E.statusMeta[k].label}</button>`).join('')}</div>
      ${rows.length ? `<div class="list">${rows.map(({ c, st }) => `<div class="item clickable" data-act="cust-open" data-id="${c.id}"><div class="avatar">${esc(U.initials(c.name))}</div><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${st.count ? `${st.count} compra${st.count > 1 ? 's' : ''} · última há ${st.since} dia${st.since === 1 ? '' : 's'}` : 'Ainda não comprou'}${c.city ? ' · ' + esc(c.city) : ''}</div></div><div class="right"><div class="title num">${U.brl0(st.total)}</div>${statusChip(st.status)}</div></div>`).join('')}</div>` : `<div class="card">${UI.empty('👥', S.customers.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda', S.customers.length ? 'Tente outro filtro ou busca.' : 'Cadastre seus clientes para acompanhar compras e nunca perder um retorno.', S.customers.length ? '' : '<button class="btn primary" data-act="cust-new">Adicionar cliente</button>')}</div>`}`;
  };
  const oppCard = (o, k) => {
    const i = STAGES.findIndex(s => s[0] === k); const late = o.next_action_date && o.next_action_date < U.today();
    return `<div class="opp"><div class="row between"><strong>${esc(o.title)}</strong><button class="icon-btn" style="width:30px;height:30px" data-act="opp-edit" data-id="${o.id}" aria-label="Editar">${UI.ico('dots', 16)}</button></div>
      <div class="small muted">${esc(custName(o.customer_id) || 'Sem cliente')}</div><div class="row between"><span class="num"><strong>${U.brl0(o.value)}</strong></span>${o.next_action_date ? `<span class="chip ${late ? 'red' : ''}">${U.fmtShort(o.next_action_date)}</span>` : ''}</div>
      ${o.next_action ? `<div class="small">➜ ${esc(o.next_action)}</div>` : ''}
      <div class="row">${i > 0 ? `<button class="btn sm ghost" data-act="opp-move" data-id="${o.id}" data-dir="-1">←</button>` : ''}<span class="grow"></span>${i < STAGES.length - 1 ? `<button class="btn sm soft" data-act="opp-move" data-id="${o.id}" data-dir="1">${esc(STAGES[i + 1][1])} →</button>` : ''}</div></div>`;
  };
  A['tab'] = d => { tabs[d.v] = d.t; refresh(); };
  A['cust-filter'] = d => { custFilter = d.k; refresh(); };
  document.addEventListener('input', e => {
    const k = e.target.dataset?.input; if (!k) return;
    if (k === 'cust-q') { custQuery = e.target.value.toLowerCase(); const pos = e.target.selectionStart; refresh(); const n = document.querySelector('[data-input=cust-q]'); n.focus(); n.setSelectionRange(pos, pos); }
    if (k === 'prod-q') { prodQuery = e.target.value.toLowerCase(); const pos = e.target.selectionStart; refresh(); const n = document.querySelector('[data-input=prod-q]'); n.focus(); n.setSelectionRange(pos, pos); }
    if (k === 'pricing') pricingCalc();
  });

  const custFields = [
    { name: 'name', label: 'Nome', required: true, full: true }, { name: 'phone', label: 'Telefone', type: 'tel' }, { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
    { name: 'email', label: 'E-mail', type: 'email' }, { name: 'city', label: 'Cidade' },
    { name: 'origin', label: 'Origem', type: 'select', options: ['', 'Indicação', 'Instagram', 'WhatsApp', 'Site', 'Loja física', 'Marketplace', 'Outros'] },
    { name: 'birthday', label: 'Aniversário', type: 'date' }, { name: 'notes', label: 'Observações', type: 'textarea', full: true }
  ];
  A['cust-new'] = () => UI.form({ title: 'Adicionar cliente', fields: custFields, onSubmit: async v => { const cu = await PE.db.insert('customers', v); PE.auto.emit('cliente_cadastrado', { customer: cu }).catch(() => {}); UI.closeModal(); refresh(); UI.toast('Cliente cadastrado.'); } });
  A['cust-edit'] = d => { const c = S.customers.find(x => x.id === d.id); UI.form({ title: 'Editar cliente', fields: custFields, values: c, onSubmit: async v => { await PE.db.update('customers', c.id, v); UI.closeModal(); refresh(); UI.toast('Cliente atualizado.'); } }); };
  A['cust-del'] = d => UI.confirm('Excluir este cliente? As vendas já registradas continuam no histórico.', async () => { await PE.db.remove('customers', d.id); refresh(); UI.toast('Cliente excluído.'); });
  A['cust-open'] = d => {
    const c = S.customers.find(x => x.id === d.id), st = E.customerStats(S, c), link = wa(c);
    const prods = Object.entries(st.products).sort((a, b) => b[1] - a[1]).slice(0, 5);
    UI.modal({ title: c.name, wide: true, body: `<div class="row wrap">${statusChip(st.status)}${c.origin ? UI.chip('Origem: ' + c.origin) : ''}${c.city ? UI.chip(c.city) : ''}</div>
      <div class="grid cols-3 keep">${kpi('Valor gasto', U.brl0(st.total))}${kpi('Compras', st.count)}${kpi('Ticket médio', U.brl0(st.ticket))}</div>
      <div class="grid cols-3 keep">${kpi('Última compra', st.last ? U.fmtDate(st.last) : '—')}${kpi('Frequência', st.freq ? `a cada ${st.freq} dias` : '—')}${kpi('Sem comprar', st.since !== null ? st.since + ' dias' : '—')}</div>
      ${c.next_action ? `<div class="alert info"><span class="dot"></span><div><div class="a-title">Próxima ação</div><div class="a-detail">${esc(c.next_action)}${c.next_action_date ? ' — ' + U.fmtDate(c.next_action_date) : ''}</div></div></div>` : ''}
      ${prods.length ? `<div><h3>Produtos que mais compra</h3><div class="row wrap" style="margin-top:8px">${prods.map(([n, q]) => UI.chip(`${n} ×${q}`)).join('')}</div></div>` : ''}
      ${c.notes ? `<div><h3>Observações</h3><p class="muted">${esc(c.notes)}</p></div>` : ''}
      <div><h3>Histórico</h3><div class="list" style="margin-top:8px">${st.sales.slice(0, 6).map(s => `<div class="item"><span class="grow">${U.fmtDate(s.sold_at)} · ${esc((s.items || []).map(i => i.name).join(', '))}</span><strong class="num">${U.brl(s.total)}</strong></div>`).join('') || '<p class="muted small">Sem compras ainda.</p>'}</div></div>
      <div class="row wrap">${link ? `<a class="btn primary" href="${link}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button class="btn ghost" data-act="sale-new" data-customer="${c.id}">Registrar venda</button><button class="btn ghost" data-act="opp-new" data-customer="${c.id}">Criar oportunidade</button><button class="btn ghost" data-act="cust-followup" data-id="${c.id}">Criar follow-up</button></div>
      <div class="row wrap"><button class="btn sm ghost" data-act="cust-edit" data-id="${c.id}">Editar</button><button class="btn sm danger" data-act="cust-del" data-id="${c.id}">Excluir</button></div>` });
  };
  A['cust-followup'] = d => {
    const c = S.customers.find(x => x.id === d.id);
    UI.form({ title: 'Criar follow-up', fields: [{ name: 'title', label: 'O que fazer?', required: true, full: true }, { name: 'due', label: 'Quando', type: 'date', required: true }], values: { title: `Contatar ${c.name}`, due: U.addDays(U.today(), 2) }, onSubmit: async v => {
      await PE.db.insert('tasks', { title: v.title, category: 'vendas', priority: 'media', status: 'aberta', due_date: v.due, customer_id: c.id, recurrence: 'nenhuma' });
      await PE.db.update('customers', c.id, { next_action: v.title, next_action_date: v.due }); UI.closeModal(); refresh(); UI.toast('Follow-up criado.');
    } });
  };

  const oppFields = (v = {}) => [
    { name: 'title', label: 'Título', required: true, full: true, placeholder: 'Ex.: Orçamento de uniformes' },
    { name: 'customer_id', label: 'Cliente', type: 'select', options: [['', '— sem cliente —'], ...S.customers.map(c => [c.id, c.name])] },
    { name: 'value', label: 'Valor estimado (R$)', type: 'number', step: '0.01' },
    { name: 'stage', label: 'Etapa', type: 'select', options: STAGES }, { name: 'next_action_date', label: 'Próxima ação em', type: 'date' },
    { name: 'next_action', label: 'Próxima ação', full: true, placeholder: 'Ex.: Enviar proposta' }, { name: 'notes', label: 'Observações', type: 'textarea', full: true }
  ];
  A['opp-new'] = d => UI.form({ title: 'Criar oportunidade', fields: oppFields(), values: { customer_id: d.customer || '', stage: 'novo', value: 0 }, onSubmit: async v => { await PE.db.insert('opportunities', { ...v, value: v.value || 0, customer_id: v.customer_id || null }); UI.closeModal(); tabs.clientes = 'pipeline'; if (view !== 'clientes') location.hash = '#/clientes'; else refresh(); UI.toast('Oportunidade criada.'); } });
  A['opp-edit'] = d => { const o = S.opportunities.find(x => x.id === d.id); UI.form({ title: 'Editar oportunidade', fields: oppFields(), values: o, extraFooter: `<button type="button" class="btn danger" data-act="opp-del" data-id="${o.id}" style="margin-right:auto">Excluir</button><button type="button" class="btn ghost" data-act="opp-lost" data-id="${o.id}">Marcar perdida</button>`, onSubmit: async v => { await PE.db.update('opportunities', o.id, { ...v, value: v.value || 0, customer_id: v.customer_id || null }); UI.closeModal(); refresh(); } }); };
  A['opp-del'] = d => { UI.closeModal(); UI.confirm('Excluir esta oportunidade?', async () => { await PE.db.remove('opportunities', d.id); refresh(); }); };
  A['opp-lost'] = async d => { await PE.db.update('opportunities', d.id, { stage: 'perdido' }); UI.closeModal(); refresh(); UI.toast('Oportunidade marcada como perdida.'); };
  A['opp-move'] = async d => {
    const o = S.opportunities.find(x => x.id === d.id); const i = STAGES.findIndex(s => s[0] === o.stage) + Number(d.dir); const to = STAGES[i][0];
    await PE.db.update('opportunities', o.id, { stage: to }); refresh();
    PE.auto.emit('oportunidade_etapa', { opp: o, customer: S.customers.find(c => c.id === o.customer_id), titulo: o.title, valor: Number(o.value), etapa: STAGES[i][1], etapaKey: to }).catch(() => {});
    if (to === 'venda') UI.confirm(`Registrar a venda de ${U.brl(o.value)} agora?`, async () => { UI.closeModal(); openSaleForm({ customer_id: o.customer_id, avulso: { name: o.title, price: Number(o.value) } }); }, 'Registrar venda');
  };

  /* ---------- VENDAS ---------- */
  VIEWS.vendas = () => {
    const p = per(), m = E.metrics(S, p).cur;
    const list = S.sales.filter(s => E.inRange(s.sold_at, p.start, p.end)).sort((a, b) => b.sold_at.localeCompare(a.sold_at) || (b.created_at || '').localeCompare(a.created_at || ''));
    return `<div class="page-head"><h1>Vendas</h1><button class="btn primary" data-act="sale-new">${UI.ico('plus', 16)} Registrar venda</button></div>${periodBar()}
      <div class="grid cols-5" style="grid-template-columns:repeat(4,minmax(0,1fr))">${kpi('Vendido', U.brl0(m.vendas), '', 'orange')}${kpi('Nº de vendas', m.qtd)}${kpi('Ticket médio', U.brl0(m.ticket))}${kpi('Margem', U.pct(m.margem, 0), '', 'green')}</div>
      ${list.length ? `<div class="list">${list.map(s => `<div class="item"><div class="avatar ${s.status === 'a_receber' ? 'orange' : ''}">${UI.ico('cart', 18)}</div><div class="grow"><div class="title">${esc(custName(s.customer_id) || 'Venda avulsa')} · ${U.brl(s.total)}</div><div class="sub">${U.fmtDate(s.sold_at)} · ${esc((s.items || []).map(i => `${i.qty}× ${i.name}`).join(', ') || '—')}${s.payment_method ? ' · ' + esc(s.payment_method) : ''}</div></div>
        <div class="right">${s.status === 'paga' ? UI.chip('Paga', 'green') : s.status === 'a_receber' ? UI.chip('A receber', 'yellow') : UI.chip('Cancelada', 'red')}<div class="row" style="justify-content:flex-end;margin-top:6px">${s.status === 'a_receber' ? `<button class="btn sm soft" data-act="sale-receive" data-id="${s.id}">Recebi</button>` : ''}${s.status !== 'cancelada' ? `<button class="btn sm ghost" data-act="sale-cancel" data-id="${s.id}">Cancelar</button>` : ''}</div></div></div>`).join('')}</div>`
        : `<div class="card">${UI.empty('🧾', 'Nenhuma venda neste período', 'Registre uma venda para acompanhar faturamento, lucro e clientes.', '<button class="btn primary" data-act="sale-new">Registrar venda</button>')}</div>`}`;
  };
  A['sale-cancel'] = d => UI.confirm('Cancelar esta venda? O estoque volta e o lançamento financeiro é removido.', async () => {
    const s = S.sales.find(x => x.id === d.id);
    for (const it of s.items || []) { const p = S.products.find(x => x.id === it.product_id); if (p && !p.is_service) await PE.actions.adjustStock(p, 'entrada', it.qty, 'Cancelamento de venda'); }
    for (const t of S.transactions.filter(t => t.sale_id === s.id)) await PE.db.remove('transactions', t.id);
    await PE.db.update('sales', s.id, { status: 'cancelada' }); refresh(); UI.toast('Venda cancelada.');
  }, 'Cancelar venda');
  A['sale-receive'] = async d => { const t = S.transactions.find(x => x.sale_id === d.id); if (t) await PE.actions.settle(t); await PE.db.update('sales', d.id, { status: 'paga' }); refresh(); UI.toast('Recebimento registrado.'); };

  A['sale-new'] = d => openSaleForm({ customer_id: d.customer || '' });
  function openSaleForm(pre = {}) {
    const prodOpts = `<option value="">Item avulso</option>${S.products.filter(p => p.active !== false).map(p => `<option value="${p.id}">${esc(p.name)} — ${U.brl(p.price)}</option>`).join('')}`;
    const row = (r = {}) => `<div class="card flat sale-row" style="padding:12px;display:grid;gap:10px"><div class="row"><select class="input" data-f="prod">${prodOpts}</select><button type="button" class="icon-btn" data-act="sale-row-del" aria-label="Remover item">${UI.ico('x', 16)}</button></div>
      <div class="form-grid" style="grid-template-columns:2fr 1fr 1fr 1fr;gap:8px"><input class="input" data-f="name" placeholder="Descrição" value="${esc(r.name || '')}"><input class="input" data-f="qty" type="number" min="0" step="any" inputmode="decimal" value="${r.qty || 1}" title="Qtd"><input class="input" data-f="price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Preço" value="${r.price ?? ''}" title="Preço unit."><input class="input" data-f="cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Custo" value="${r.cost ?? ''}" title="Custo unit."></div></div>`;
    UI.modal({ title: 'Registrar venda', wide: true, body: `<form id="sale-form" class="stack" novalidate>
      <div class="form-grid">
        <div class="field"><label>Cliente</label><select class="input" name="customer_id"><option value="">— venda avulsa —</option>${S.customers.map(c => `<option value="${c.id}" ${c.id === pre.customer_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Data</label><input class="input" type="date" name="sold_at" value="${U.today()}" required></div>
        <div class="field"><label>Forma de pagamento</label><select class="input" name="payment_method">${PAY.map(x => `<option>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Situação</label><select class="input" name="status"><option value="paga">Já recebi</option><option value="a_receber">A receber</option></select></div>
        <div class="field hidden" id="due-wrap"><label>Vence em</label><input class="input" type="date" name="due_date" value="${U.addDays(U.today(), 15)}"></div>
        <div class="field"><label>Desconto (R$)</label><input class="input" type="number" min="0" step="0.01" name="discount" inputmode="decimal" placeholder="0,00"></div></div>
      <div><div class="row between"><h3>Itens</h3><button type="button" class="btn sm ghost" data-act="sale-row-add">+ Item</button></div><div id="sale-rows" class="stack" style="margin-top:8px"></div></div>
      <div class="field"><label>Observações</label><input class="input" name="notes"></div>
      <div class="card flat" id="sale-sum"></div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">Registrar venda</button></div></form>`,
      onMount: m => {
        const rows = m.querySelector('#sale-rows'), form = m.querySelector('#sale-form');
        const addRow = r => { rows.insertAdjacentHTML('beforeend', row(r)); };
        addRow(pre.avulso ? { name: pre.avulso.name, price: pre.avulso.price, cost: 0 } : {});
        m._addRow = addRow;
        const calc = () => {
          let gross = 0, cost = 0;
          rows.querySelectorAll('.sale-row').forEach(r => { const q = Number(r.querySelector('[data-f=qty]').value) || 0; gross += q * (Number(r.querySelector('[data-f=price]').value) || 0); cost += q * (Number(r.querySelector('[data-f=cost]').value) || 0); });
          const disc = Number(form.discount.value) || 0, total = Math.max(0, gross - disc), profit = total - cost;
          m.querySelector('#sale-sum').innerHTML = `<div class="row between"><span class="muted">Total</span><strong class="num" style="font-size:22px;font-family:var(--font-head)">${U.brl(total)}</strong></div><div class="row between small"><span class="muted">Lucro bruto estimado</span><span class="${profit < 0 ? 'down' : 'up'} num">${U.brl(profit)}${total ? ' · ' + U.pct(profit / total * 100, 0) : ''}</span></div>${profit < 0 ? '<p class="small down" style="margin-top:6px">⚠ Esta venda dá prejuízo.</p>' : ''}`;
        };
        form.addEventListener('input', e => {
          if (e.target.dataset.f === 'prod') { const p = S.products.find(x => x.id === e.target.value), r = e.target.closest('.sale-row'); if (p) { r.querySelector('[data-f=name]').value = p.name; r.querySelector('[data-f=price]').value = p.price; r.querySelector('[data-f=cost]').value = p.cost; } }
          calc();
        });
        form.status.addEventListener('change', () => m.querySelector('#due-wrap').classList.toggle('hidden', form.status.value !== 'a_receber'));
        calc();
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const items = [...rows.querySelectorAll('.sale-row')].map(r => ({ product_id: r.querySelector('[data-f=prod]').value || null, name: r.querySelector('[data-f=name]').value.trim(), qty: Number(r.querySelector('[data-f=qty]').value) || 0, unit_price: Number(r.querySelector('[data-f=price]').value) || 0, unit_cost: Number(r.querySelector('[data-f=cost]').value) || 0 })).filter(i => i.name && i.qty > 0);
          if (!items.length) return UI.toast('Adicione ao menos um item com descrição e quantidade.', 'err');
          if (!form.sold_at.value) return UI.toast('Informe a data.', 'err');
          const over = items.find(i => { const p = S.products.find(x => x.id === i.product_id); return p && !p.is_service && Number(p.stock) < i.qty; });
          await UI.run(async () => {
            await PE.actions.registerSale({ customer_id: form.customer_id.value || null, sold_at: form.sold_at.value, payment_method: form.payment_method.value, status: form.status.value, discount: Number(form.discount.value) || 0, items, notes: form.notes.value.trim(), due_date: form.due_date.value });
            UI.closeModal(); refresh(); UI.toast(over ? 'Venda registrada — atenção: o estoque ficou negativo.' : 'Venda registrada!');
          }, form.querySelector('[type=submit]'));
        });
      } });
  }
  A['sale-row-add'] = () => document.querySelector('.modal')._addRow({});
  A['sale-row-del'] = (_d, el) => { const rows = document.querySelectorAll('.sale-row'); if (rows.length > 1) { el.closest('.sale-row').remove(); document.getElementById('sale-form').dispatchEvent(new Event('input')); } };

  /* ---------- FINANCEIRO ---------- */
  const txDue = t => { const d = U.daysBetween(U.today(), t.due_date); return t.paid_date ? UI.chip(t.kind === 'receita' ? 'Recebido' : 'Pago', 'green') : d < 0 ? UI.chip(`Vencida há ${-d}d`, 'red') : d === 0 ? UI.chip('Vence hoje', 'orange') : UI.chip(`Vence em ${d}d`, d <= 3 ? 'yellow' : ''); };
  const txItem = t => `<div class="item"><div class="avatar ${t.kind === 'receita' ? 'orange' : ''}">${t.kind === 'receita' ? '↓' : '↑'}</div><div class="grow"><div class="title">${esc(t.description)}</div><div class="sub">${U.fmtDate(t.paid_date || t.due_date)}${t.category ? ' · ' + esc(t.category) : ''}${t.recurrence && t.recurrence !== 'nenhuma' ? ' · 🔁 ' + t.recurrence : ''}</div></div>
    <div class="right"><div class="title num ${t.kind === 'receita' ? 'up' : ''}">${t.kind === 'receita' ? '+' : '−'} ${U.brl(t.amount)}</div>${txDue(t)}<div class="row" style="justify-content:flex-end;margin-top:6px">${!t.paid_date ? `<button class="btn sm soft" data-act="tx-settle" data-id="${t.id}">${t.kind === 'receita' ? 'Recebi' : 'Paguei'}</button>` : ''}<button class="btn sm ghost" data-act="tx-edit" data-id="${t.id}">Editar</button></div></div></div>`;

  VIEWS.financeiro = () => {
    const tab = tabs.financeiro, p = per(), m = E.metrics(S, p);
    const T = U.today(), pend = S.transactions.filter(t => !t.paid_date);
    const head = `<div class="page-head"><h1>Financeiro</h1><div class="row wrap"><button class="btn primary" data-act="tx-new" data-kind="receita">+ Receita</button><button class="btn ghost" data-act="tx-new" data-kind="despesa">+ Despesa</button></div></div>
      <div class="filters">${[['resumo', 'Resumo'], ['pagar', 'A pagar'], ['receber', 'A receber'], ['lancamentos', 'Lançamentos'], ['dre', 'Resultado']].map(([k, l]) => `<button class="pill ${tab === k ? 'active' : ''}" data-act="tab" data-v="financeiro" data-t="${k}">${l}</button>`).join('')}</div>`;
    if (tab === 'pagar' || tab === 'receber') {
      const kind = tab === 'pagar' ? 'despesa' : 'receita';
      const list = pend.filter(t => t.kind === kind).sort((a, b) => a.due_date.localeCompare(b.due_date));
      const total = list.reduce((s, t) => s + Number(t.amount), 0);
      return head + `<div class="card kpi ${kind === 'despesa' ? '' : 'orange'}"><div class="label">Total ${tab === 'pagar' ? 'a pagar' : 'a receber'}</div><div class="value num">${U.brl(total)}</div></div>${list.length ? `<div class="list">${list.map(txItem).join('')}</div>` : `<div class="card">${UI.empty('✅', 'Nada pendente', tab === 'pagar' ? 'Nenhuma conta a pagar cadastrada.' : 'Nenhum recebimento pendente.')}</div>`}`;
    }
    if (tab === 'lancamentos') {
      const list = S.transactions.filter(t => E.inRange(t.paid_date || t.due_date, p.start, p.end)).sort((a, b) => (b.paid_date || b.due_date).localeCompare(a.paid_date || a.due_date));
      return head + periodBar() + (list.length ? `<div class="list">${list.slice(0, 200).map(txItem).join('')}</div>` : `<div class="card">${UI.empty('📒', 'Sem lançamentos no período', 'Lance receitas e despesas para acompanhar seu caixa.')}</div>`);
    }
    if (tab === 'dre') {
      const c = m.cur; const cats = {};
      S.transactions.filter(t => t.kind === 'despesa' && t.category !== 'Compra de mercadoria' && E.inRange(t.paid_date || t.due_date, p.start, p.end)).forEach(t => { const k = t.category || 'Outros'; cats[k] = (cats[k] || 0) + Number(t.amount); });
      const be = c.margem > 0 ? c.despOp / (c.margem / 100) : null;
      const line = (l, v, b, cls = '') => `<div class="row between" style="padding:9px 0;border-bottom:1px solid var(--silver-100);${b ? 'font-weight:700' : ''}"><span>${l}</span><span class="num ${cls}">${U.brl(v)}</span></div>`;
      return head + periodBar() + `<div class="grid cols-2"><div class="card"><div class="card-title"><h2>Resultado do período</h2></div>${line('Vendas', c.vendas, true)}${line('(−) Custo dos produtos vendidos', -c.cmv)}${line('Lucro bruto', c.vendas - c.cmv, true)}${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => line('(−) ' + esc(k), -v)).join('')}${line('Resultado operacional (lucro)', c.lucro, true, c.lucro >= 0 ? 'up' : 'down')}<p class="small muted" style="margin-top:10px">Margem final: <strong>${c.vendas ? U.pct(c.lucro / c.vendas * 100, 0) : '—'}</strong></p></div>
        <div class="card"><div class="card-title"><h2>Ponto de equilíbrio</h2></div>${be ? `<p class="muted">Para cobrir as despesas do período com a margem média de ${U.pct(c.margem, 0)}, você precisa vender:</p><div class="value num" style="font-family:var(--font-head);font-size:32px;margin:8px 0">${U.brl0(be)}</div><div class="progress"><span style="width:${Math.min(100, c.vendas / be * 100)}%"></span></div><p class="small muted" style="margin-top:8px">Você já vendeu ${U.brl0(c.vendas)} (${U.pct(Math.min(999, c.vendas / be * 100), 0)}).</p>` : '<p class="muted">Registre vendas e despesas para calcular o ponto de equilíbrio.</p>'}</div></div>`;
    }
    // Resumo
    const pr = E.cashProjection(S, 45);
    const in30 = k => pend.filter(t => t.kind === k && t.due_date <= U.addDays(T, 30)).reduce((s, t) => s + Number(t.amount), 0);
    const cats = {}; S.transactions.filter(t => t.kind === 'despesa' && E.inRange(t.paid_date || t.due_date, p.start, p.end)).forEach(t => { const k = t.category || 'Outros'; cats[k] = (cats[k] || 0) + Number(t.amount); });
    const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]); const catMax = catRows[0]?.[1] || 1;
    return head + periodBar() + `<div class="grid cols-5" style="grid-template-columns:repeat(4,minmax(0,1fr))">${kpi('Caixa hoje', U.brl0(m.caixa), '', m.caixa >= 0 ? 'black' : 'red')}${kpi('A receber (30d)', U.brl0(in30('receita')), '', 'orange')}${kpi('A pagar (30d)', U.brl0(in30('despesa')))}${kpi('Previsão em 45d', U.brl0(pr.end), pr.firstNegative ? '<span class="down">fica negativo</span>' : '<span class="up">positivo</span>', pr.end >= 0 ? 'green' : 'red')}</div>
      <div class="grid cols-2"><div class="card"><div class="card-title"><h2>Previsão do caixa</h2><span class="chip">45 dias</span></div>${S.transactions.length ? UI.line(pr.series) : '<p class="muted small">Sem dados ainda.</p>'}<p class="small muted" style="margin-top:6px">Considera o saldo de hoje e todas as contas pendentes.</p></div>
        <div class="card"><div class="card-title"><h2>Para onde vai o dinheiro</h2></div>${catRows.length ? `<div class="stack" style="gap:10px">${catRows.slice(0, 6).map(([k, v]) => `<div><div class="row between small"><span>${esc(k)}</span><strong class="num">${U.brl0(v)}</strong></div><div class="progress"><span style="width:${v / catMax * 100}%;background:var(--ink)"></span></div></div>`).join('')}</div>` : '<p class="muted small">Sem despesas no período.</p>'}</div></div>`;
  };
  const txFields = kind => [
    { name: 'kind', label: 'Tipo', type: 'select', options: [['receita', 'Receita (entrada)'], ['despesa', 'Despesa (saída)']] }, { name: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', required: true, min: 0 },
    { name: 'description', label: 'Descrição', required: true, full: true }, { name: 'category', label: 'Categoria', list: kind === 'receita' ? CATS_REC : CATS_DESP },
    { name: 'due_date', label: 'Vencimento', type: 'date', required: true }, { name: 'recurrence', label: 'Repete', type: 'select', options: [['nenhuma', 'Não repete'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês'], ['anual', 'Todo ano']] },
    { name: 'cost_center', label: 'Centro de custo', placeholder: 'Ex.: Loja, Marketing' }, { name: 'paid', label: 'Situação', type: 'checkbox', checkLabel: 'Já foi pago / recebido' }
  ];
  A['tx-new'] = d => { const kind = d.kind || 'despesa'; UI.form({ title: kind === 'receita' ? 'Nova receita' : 'Nova despesa', fields: txFields(kind), values: { kind, due_date: U.today(), recurrence: 'nenhuma' }, onSubmit: async v => { const { paid, ...row } = v; if (!(row.amount > 0)) throw new Error('Informe um valor maior que zero.'); await PE.db.insert('transactions', { ...row, paid_date: paid ? row.due_date : null }); UI.closeModal(); refresh(); UI.toast('Lançamento salvo.'); } }); };
  A['tx-edit'] = d => { const t = S.transactions.find(x => x.id === d.id); UI.form({ title: 'Editar lançamento', fields: txFields(t.kind), values: { ...t, paid: !!t.paid_date }, extraFooter: `<button type="button" class="btn danger" data-act="tx-del" data-id="${t.id}" style="margin-right:auto">Excluir</button>`, onSubmit: async v => { const { paid, ...row } = v; await PE.db.update('transactions', t.id, { ...row, paid_date: paid ? (t.paid_date || row.due_date) : null }); UI.closeModal(); refresh(); } }); };
  A['tx-del'] = d => { UI.closeModal(); UI.confirm('Excluir este lançamento?', async () => { await PE.db.remove('transactions', d.id); refresh(); }); };
  A['tx-settle'] = async d => { const t = S.transactions.find(x => x.id === d.id); await PE.actions.settle(t); if (t.sale_id) await PE.db.update('sales', t.sale_id, { status: 'paga' }); refresh(); UI.toast(t.kind === 'receita' ? 'Recebimento registrado.' : 'Pagamento registrado.'); };

  /* ---------- PRODUTOS ---------- */
  let prodQuery = '', prodFilter = 'todos';
  VIEWS.produtos = () => {
    const target = Number(S.company.target_margin || 30);
    const rows = S.products.map(p => ({ p, st: E.productStats(S, p) }));
    const idle = rows.filter(x => x.st.idle), idleVal = idle.reduce((s, x) => s + x.st.stockValue, 0);
    const f = { todos: () => true, baixo: x => !x.p.is_service && Number(x.p.min_stock) > 0 && Number(x.p.stock) <= Number(x.p.min_stock), margem: x => Number(x.p.price) > 0 && x.st.margin < target, parados: x => x.st.idle, alta: x => x.st.q30prev >= 2 && x.st.q30 > x.st.q30prev * 1.2 }[prodFilter];
    const list = rows.filter(x => f(x) && (!prodQuery || (x.p.name + ' ' + (x.p.sku || '')).toLowerCase().includes(prodQuery))).sort((a, b) => a.p.name.localeCompare(b.p.name));
    return `<div class="page-head"><h1>Produtos</h1><div class="row wrap"><button class="btn primary" data-act="prod-new">${UI.ico('plus', 16)} Novo produto</button><a class="btn ghost" href="#/precificacao">Precificação</a></div></div>
      ${idleVal > 0 ? `<div class="alert info"><span class="dot"></span><div class="grow"><div class="a-title">Você possui ${U.brl0(idleVal)} em produtos sem venda há mais de 90 dias.</div><div class="a-detail">${idle.slice(0, 4).map(x => esc(x.p.name)).join(', ')}. Uma promoção pode transformar isso em caixa.</div><div class="a-actions"><button class="btn sm ghost" data-act="prod-filter" data-k="parados">Ver produtos parados</button></div></div></div>` : ''}
      <input class="input" placeholder="Buscar produto ou SKU…" data-input="prod-q" value="${esc(prodQuery)}">
      <div class="filters">${[['todos', 'Todos'], ['baixo', 'Estoque baixo'], ['margem', 'Margem baixa'], ['parados', 'Parados'], ['alta', 'Vendendo mais']].map(([k, l]) => `<button class="pill ${prodFilter === k ? 'active' : ''}" data-act="prod-filter" data-k="${k}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="list">${list.map(({ p, st }) => `<div class="item clickable" data-act="prod-edit" data-id="${p.id}"><div class="avatar">${esc(U.initials(p.name))}</div><div class="grow"><div class="title">${esc(p.name)} ${p.is_service ? UI.chip('Serviço') : ''}</div><div class="sub">${p.sku ? esc(p.sku) + ' · ' : ''}Custo ${U.brl(p.cost)} · Preço ${U.brl(p.price)}${!p.is_service ? ` · Estoque ${Number(p.stock)}` : ''}</div></div><div class="right">${marginChip(st.margin)}<div class="row" style="justify-content:flex-end;margin-top:6px">${st.idle ? UI.chip('Parado', 'yellow') : ''}${!p.is_service && Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock) ? UI.chip('Repor', 'red') : ''}</div></div></div>`).join('')}</div>` : `<div class="card">${UI.empty('📦', S.products.length ? 'Nada encontrado' : 'Nenhum produto ainda', S.products.length ? 'Tente outro filtro.' : 'Cadastre seus produtos e serviços para o Prumo calcular margem e vigiar o estoque.', S.products.length ? '' : '<button class="btn primary" data-act="prod-new">Cadastrar produto</button>')}</div>`}`;
  };
  A['prod-filter'] = d => { prodFilter = d.k; if (view !== 'produtos') location.hash = '#/produtos'; else refresh(); };
  const prodFields = [
    { name: 'name', label: 'Nome', required: true, full: true }, { name: 'sku', label: 'SKU / código' }, { name: 'category', label: 'Categoria', list: [...new Set(S.products.map(p => p.category).filter(Boolean))] },
    { name: 'cost', label: 'Custo (R$)', type: 'number', step: '0.01', min: 0, required: true }, { name: 'price', label: 'Preço de venda (R$)', type: 'number', step: '0.01', min: 0, required: true },
    { name: 'fee_pct', label: 'Taxas sobre a venda (%)', type: 'number', step: '0.01', min: 0, hint: 'Cartão, comissão, impostos…' }, { name: 'barcode', label: 'Código de barras' },
    { name: 'stock', label: 'Estoque atual', type: 'number', step: 'any' }, { name: 'min_stock', label: 'Estoque mínimo', type: 'number', step: 'any' },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true }, { name: 'is_service', label: 'Tipo', type: 'checkbox', checkLabel: 'É um serviço (não controla estoque)' }
  ];
  const cleanProd = v => ({ ...v, cost: v.cost || 0, price: v.price || 0, fee_pct: v.fee_pct || 0, stock: v.stock || 0, min_stock: v.min_stock || 0, active: true });
  A['prod-new'] = () => UI.form({ title: 'Novo produto', fields: prodFields, values: { fee_pct: 0, stock: 0, min_stock: 0 }, onSubmit: async v => { await PE.db.insert('products', cleanProd(v)); UI.closeModal(); refresh(); UI.toast('Produto cadastrado.'); } });
  A['prod-edit'] = d => {
    const p = S.products.find(x => x.id === d.id);
    UI.form({ title: 'Editar produto', fields: prodFields, values: p, extraFooter: `<button type="button" class="btn danger" data-act="prod-del" data-id="${p.id}" style="margin-right:auto">Excluir</button>${p.is_service ? '' : `<button type="button" class="btn ghost" data-act="stock-adjust" data-id="${p.id}">Ajustar estoque</button>`}<a class="btn ghost" href="#/precificacao" data-act="price-from" data-id="${p.id}">Precificar</a>`, onSubmit: async v => { await PE.db.update('products', p.id, cleanProd(v)); UI.closeModal(); refresh(); UI.toast('Produto atualizado.'); } });
  };
  A['prod-del'] = d => { UI.closeModal(); UI.confirm('Excluir este produto?', async () => { await PE.db.remove('products', d.id); refresh(); }); };
  A['stock-adjust'] = d => {
    const p = S.products.find(x => x.id === d.id); UI.closeModal();
    UI.form({ title: `Estoque — ${p.name}`, fields: [{ name: 'kind', label: 'Movimento', type: 'select', options: [['entrada', 'Entrada (compra/reposição)'], ['saida', 'Saída (perda/consumo)'], ['ajuste', 'Ajuste (definir quantidade)']] }, { name: 'quantity', label: 'Quantidade', type: 'number', step: 'any', required: true, min: 0, hint: `Estoque atual: ${p.stock}` }, { name: 'reason', label: 'Motivo', full: true }], values: { kind: 'entrada' }, onSubmit: async v => { await PE.actions.adjustStock(p, v.kind, v.quantity, v.reason); UI.closeModal(); refresh(); UI.toast('Estoque atualizado.'); } });
  };

  /* ---------- PRECIFICAÇÃO ---------- */
  let priceProduct = null;
  VIEWS.precificacao = () => {
    const p = S.products.find(x => x.id === priceProduct);
    const v = { cost: p?.cost ?? '', tax: '', commission: '', card: p?.fee_pct ?? '', freight: '', expenses: '', margin: S.company.target_margin || 30 };
    const inp = (n, l, val, step = '0.01', hint) => `<div class="field"><label>${l}</label><input class="input" type="number" min="0" step="${step}" inputmode="decimal" id="pr-${n}" data-input="pricing" value="${val}" placeholder="0">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    setTimeout(pricingCalc, 0);
    return `<div class="page-head"><div><h1>Precificação</h1><p class="muted">Descubra o preço certo e simule descontos antes de decidir.</p></div></div>
      <div class="grid cols-2"><div class="card stack"><div class="card-title"><h2>Custos e taxas</h2></div>
        <div class="field"><label>Carregar de um produto</label><select class="input" id="pr-prod" data-act-change="price-load"><option value="">— digitar manualmente —</option>${S.products.map(x => `<option value="${x.id}" ${x.id === priceProduct ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="form-grid">${inp('cost', 'Custo do produto (R$)', v.cost)}${inp('freight', 'Frete (R$)', v.freight)}${inp('expenses', 'Despesas por unidade (R$)', v.expenses, '0.01', 'Embalagem, rateio de aluguel…')}${inp('tax', 'Impostos (%)', v.tax)}${inp('commission', 'Comissão (%)', v.commission)}${inp('card', 'Taxa do cartão (%)', v.card)}${inp('margin', 'Margem desejada (%)', v.margin)}</div></div>
        <div class="stack"><div class="card" id="pr-out"></div><div class="card stack" id="pr-sim"><div class="card-title"><h2>Simulador</h2></div>
          <div class="form-grid"><div class="field"><label>Preço de partida (R$)</label><input class="input" type="number" step="0.01" inputmode="decimal" id="pr-base" data-input="pricing" placeholder="Usa o recomendado"></div><div class="field"><label>Se eu der desconto de (%)</label><input class="input" type="number" step="0.1" min="0" id="pr-disc" data-input="pricing" value="10"></div><div class="field full"><label>Se eu vender por (R$)</label><input class="input" type="number" step="0.01" inputmode="decimal" id="pr-alt" data-input="pricing" placeholder="Ex.: 99,90"></div></div><div id="pr-sim-out" class="stack" style="gap:8px"></div></div></div></div>`;
  };
  document.addEventListener('change', e => { if (e.target.dataset?.actChange === 'price-load') { priceProduct = e.target.value || null; const p = S.products.find(x => x.id === priceProduct); if (p) { document.getElementById('pr-cost').value = p.cost; document.getElementById('pr-card').value = p.fee_pct || ''; document.getElementById('pr-base').value = p.price; } pricingCalc(); } });
  A['price-from'] = d => { priceProduct = d.id; UI.closeModal(); if (view === 'precificacao') refresh(); else location.hash = '#/precificacao'; };
  function pricingCalc() {
    const g = id => Number(document.getElementById(id)?.value) || 0; if (!document.getElementById('pr-out')) return;
    const r = E.pricing({ cost: g('pr-cost'), tax: g('pr-tax'), commission: g('pr-commission'), card: g('pr-card'), freight: g('pr-freight'), expenses: g('pr-expenses'), margin: g('pr-margin') });
    const out = document.getElementById('pr-out');
    if (!r.viable) { out.innerHTML = '<p class="down"><strong>Impossível fechar a conta:</strong> impostos, taxas e margem somam 100% ou mais. Reduza algum percentual.</p>'; document.getElementById('pr-sim-out').innerHTML = ''; return; }
    const box = (l, v, cls, sub) => `<div class="card flat kpi ${cls}" style="padding:14px"><div class="label">${l}</div><div class="value num" style="font-size:24px">${U.brl(v)}</div><div class="delta muted">${sub}</div></div>`;
    const rr = r.resulting(r.rec);
    out.innerHTML = `<div class="card-title"><h2>Resultado</h2></div><div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">${box('Preço mínimo', r.min, '', 'lucro zero')}${box('Recomendado', r.rec, 'orange', `margem ${U.pct(g('pr-margin'), 0)}`)}${box('Promocional', r.promo, 'black', `margem ${U.pct(g('pr-margin') / 2, 0)}`)}</div><p class="small muted" style="margin-top:10px">No preço recomendado você ganha <strong>${U.brl(rr.profit)}</strong> por unidade (${U.pct(rr.margin, 0)}).</p>${priceProduct ? `<button class="btn sm soft" style="margin-top:10px" data-act="price-apply">Aplicar preço recomendado ao produto</button>` : ''}`;
    const base = g('pr-base') || r.rec, disc = g('pr-disc'), alt = g('pr-alt'); const so = document.getElementById('pr-sim-out');
    const line = (q, price) => { const x = r.resulting(price); return `<div class="alert ${x.profit <= 0 ? 'urgent' : x.margin < 10 ? 'attention' : 'opportunity'}"><span class="dot"></span><div><div class="a-title">${q}</div><div class="a-detail">Preço ${U.brl(price)} → lucro de ${U.brl(x.profit)} por unidade · margem ${U.pct(x.margin, 0)}</div></div></div>`; };
    so.innerHTML = line(`Se eu der ${U.pct(disc, 0)} de desconto…`, base * (1 - disc / 100)) + (alt ? line(`Se eu vender por ${U.brl(alt)}…`, alt) : '');
  }
  A['price-apply'] = async () => { const p = S.products.find(x => x.id === priceProduct); const r = E.pricing({ cost: Number(document.getElementById('pr-cost').value) || 0, tax: Number(document.getElementById('pr-tax').value) || 0, commission: Number(document.getElementById('pr-commission').value) || 0, card: Number(document.getElementById('pr-card').value) || 0, freight: Number(document.getElementById('pr-freight').value) || 0, expenses: Number(document.getElementById('pr-expenses').value) || 0, margin: Number(document.getElementById('pr-margin').value) || 0 }); await PE.db.update('products', p.id, { price: Math.ceil(r.rec * 100) / 100 }); refresh(); UI.toast(`Preço de ${p.name} atualizado.`); };

  /* ---------- TAREFAS ---------- */
  let taskCat = 'todas';
  const TASK_CATS = ['vendas', 'financeiro', 'marketing', 'estoque', 'administrativo'];
  VIEWS.tarefas = () => {
    const T = U.today(), all = S.tasks.filter(t => taskCat === 'todas' || (taskCat === 'minhas' ? t.assignee_id === PE.db.user?.id : t.category === taskCat));
    const open = all.filter(t => t.status !== 'concluida').sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9'));
    const groups = [['Atrasadas', open.filter(t => t.due_date && t.due_date < T), 'red'], ['Hoje', open.filter(t => t.due_date === T), 'orange'], ['Próximas', open.filter(t => t.due_date > T), ''], ['Sem prazo', open.filter(t => !t.due_date), '']];
    const done = all.filter(t => t.status === 'concluida').slice(0, 8);
    const item = t => `<div class="item"><button class="icon-btn" data-act="task-toggle" data-id="${t.id}" aria-label="Concluir" style="${t.status === 'concluida' ? 'background:var(--green);color:#fff;border-color:var(--green)' : ''}">${t.status === 'concluida' ? '✓' : ''}</button><div class="grow clickable" data-act="task-edit" data-id="${t.id}"><div class="title" style="${t.status === 'concluida' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</div><div class="sub">${esc(t.category)}${t.due_date ? ' · ' + U.fmtDate(t.due_date) : ''}${custName(t.customer_id) ? ' · ' + esc(custName(t.customer_id)) : ''}${t.assignee_id && memberOf(t.assignee_id) ? ' · 👤 ' + esc(memberName(memberOf(t.assignee_id))) : ''}${t.recurrence && t.recurrence !== 'nenhuma' ? ' · 🔁 ' + t.recurrence : ''}</div></div>${t.status !== 'concluida' && wa(S.customers.find(c => c.id === t.customer_id) || {}) ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${wa(S.customers.find(c => c.id === t.customer_id))}">WhatsApp</a>` : ''}${UI.chip(t.priority, t.priority === 'alta' ? 'red' : t.priority === 'media' ? 'yellow' : '')}</div>`;
    return `<div class="page-head"><h1>Tarefas</h1><button class="btn primary" data-act="task-new">${UI.ico('plus', 16)} Nova tarefa</button></div>
      <div class="filters">${['todas', ...(S.members.length > 1 ? ['minhas'] : []), ...TASK_CATS].map(k => `<button class="pill ${taskCat === k ? 'active' : ''}" data-act="task-cat" data-k="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      ${open.length ? groups.filter(g => g[1].length).map(([l, arr, cls]) => `<div class="stack" style="gap:8px"><div class="row"><h3>${l}</h3>${UI.chip(arr.length, cls)}</div><div class="list">${arr.map(item).join('')}</div></div>`).join('') : `<div class="card">${UI.empty('✅', 'Nenhuma tarefa aberta', 'Crie tarefas para não esquecer cobranças, reposições e follow-ups.', '<button class="btn primary" data-act="task-new">Nova tarefa</button>')}</div>`}
      ${done.length ? `<div class="stack" style="gap:8px"><h3>Concluídas recentemente</h3><div class="list">${done.map(item).join('')}</div></div>` : ''}`;
  };
  A['task-cat'] = d => { taskCat = d.k; refresh(); };
  const taskFields = () => [
    { name: 'title', label: 'Tarefa', required: true, full: true }, { name: 'category', label: 'Categoria', type: 'select', options: TASK_CATS }, { name: 'priority', label: 'Prioridade', type: 'select', options: [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] },
    { name: 'due_date', label: 'Prazo', type: 'date' }, { name: 'recurrence', label: 'Repete', type: 'select', options: [['nenhuma', 'Não repete'], ['diaria', 'Todo dia'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']] },
    { name: 'assignee_id', label: 'Responsável', type: 'select', options: [['', '— ninguém —'], ...S.members.map(m => [m.user_id, memberName(m)])] },
    { name: 'customer_id', label: 'Cliente (opcional)', type: 'select', options: [['', '—'], ...S.customers.map(c => [c.id, c.name])] }
  ];
  A['task-new'] = () => UI.form({ title: 'Nova tarefa', fields: taskFields(), values: { category: 'administrativo', priority: 'media', recurrence: 'nenhuma', due_date: U.today() }, onSubmit: async v => { await PE.db.insert('tasks', { ...v, customer_id: v.customer_id || null, assignee_id: v.assignee_id || null, status: 'aberta' }); UI.closeModal(); refresh(); } });
  A['task-edit'] = d => { const t = S.tasks.find(x => x.id === d.id); UI.form({ title: 'Editar tarefa', fields: taskFields(), values: t, extraFooter: `<button type="button" class="btn danger" data-act="task-del" data-id="${t.id}" style="margin-right:auto">Excluir</button>`, onSubmit: async v => { await PE.db.update('tasks', t.id, { ...v, customer_id: v.customer_id || null, assignee_id: v.assignee_id || null }); UI.closeModal(); refresh(); } }); };
  A['task-del'] = async d => { await PE.db.remove('tasks', d.id); UI.closeModal(); refresh(); };
  A['task-toggle'] = async d => {
    const t = S.tasks.find(x => x.id === d.id); const done = t.status !== 'concluida';
    await PE.db.update('tasks', t.id, { status: done ? 'concluida' : 'aberta' });
    if (done && t.recurrence && t.recurrence !== 'nenhuma') { const base = t.due_date || U.today(); const n = t.recurrence === 'diaria' ? U.addDays(base, 1) : t.recurrence === 'semanal' ? U.addDays(base, 7) : (() => { const x = new Date(base + 'T12:00:00'); x.setMonth(x.getMonth() + 1); return U.iso(x); })(); await PE.db.insert('tasks', { title: t.title, category: t.category, priority: t.priority, status: 'aberta', due_date: n, recurrence: t.recurrence, customer_id: t.customer_id }); }
    refresh();
  };

  /* ---------- ATENÇÃO ---------- */
  VIEWS.atencao = () => {
    const al = E.alerts(S);
    const groups = ['urgent', 'attention', 'opportunity', 'info'].map(l => [l, al.filter(a => a.level === l)]).filter(g => g[1].length);
    return `<div class="page-head"><div><h1>Atenção</h1><p class="muted">Tudo que merece o seu olhar, em um só lugar.</p></div></div>
      <div class="row wrap">${['urgent', 'attention', 'opportunity', 'info'].map(l => `<span class="chip">${E.levelMeta[l].emoji} ${E.levelMeta[l].label}: ${al.filter(a => a.level === l).length}</span>`).join('')}</div>
      ${groups.length ? groups.map(([l, arr]) => `<div class="stack" style="gap:8px"><h3>${E.levelMeta[l].emoji} ${E.levelMeta[l].label}</h3><div class="list">${arr.map(a => alertHTML(a)).join('')}</div></div>`).join('') : `<div class="card">${UI.empty('🟢', 'Tudo tranquilo por aqui', 'Nenhum alerta ativo. O Prumo continua vigiando caixa, contas, estoque, margem e clientes.')}</div>`}`;
  };

  /* ---------- CONSULTOR ---------- */
  VIEWS.consultor = () => `<div class="page-head"><div><h1>Consultor</h1><p class="muted">Pergunte sobre o seu negócio. Eu respondo com os seus números.</p></div></div>
    <div class="card stack"><div class="chat" id="chat">${session.chat.length ? session.chat.map(chatHTML).join('') : `<div class="empty"><div class="em-ico">✨</div><h3>O que você quer saber?</h3><p class="small">Escolha uma pergunta ou escreva a sua.</p></div>`}</div>
      <div class="suggest">${E.suggestions.map(s => `<button class="pill" data-act="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <form id="ask-form" class="row"><input class="input grow" id="ask-input" placeholder="Ex.: Posso dar 15% de desconto?" autocomplete="off"><button class="btn primary" type="submit">Perguntar</button></form></div>`;
  const chatHTML = m => `<div class="bubble">${esc(m.q)}</div><div class="answer">${[['Dado', m.a.dado], ['Causa provável', m.a.causa], ['Impacto', m.a.impacto], ['Ação', m.a.acao]].map(([t, x]) => `<div class="blk ${t === 'Ação' ? 'act' : ''}"><div class="tag">${t}</div><div>${esc(x)}</div></div>`).join('')}</div>`;
  async function ask(q) {
    q = q.trim(); if (!q) return; const a = E.ask(S, q); session.chat.push({ q, a });
    refresh(); document.getElementById('chat')?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { await PE.db.insert('consultations', { question: q, answer: a }); } catch (e) { console.warn('consulta não salva', e); }
  }
  A['ask'] = d => ask(d.q);
  document.addEventListener('submit', e => { if (e.target.id === 'ask-form') { e.preventDefault(); const i = document.getElementById('ask-input'); const q = i.value; i.value = ''; ask(q); } });

  /* ---------- LEMBRETES DE WHATSAPP ---------- */
  let waFilter = 'todos';
  VIEWS.lembretes = () => {
    const all = E.reminders(S), st = E.waStats(S), T = E.waTypes;
    const list = all.filter(r => waFilter === 'todos' || r.type === waFilter);
    const count = t => all.filter(r => r.type === t).length;
    return `<div class="page-head"><div><h1>Lembretes de WhatsApp</h1><p class="muted">Quem contatar hoje, com a mensagem pronta. Você revisa e envia.</p></div><button class="btn ghost" data-act="wa-templates">Editar mensagens</button></div>
      <div class="grid cols-5" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi('Para contatar hoje', all.length, '', 'orange')}${kpi('Enviadas em 30 dias', st.sent30, '', 'black')}${kpi('Clientes que voltaram', st.back, st.back ? `<span class="up">${U.brl0(st.value)} em vendas</span>` : '<span class="muted">após contato de retorno</span>', 'green')}</div>
      <div class="filters"><button class="pill ${waFilter === 'todos' ? 'active' : ''}" data-act="wa-filter" data-k="todos">Todos (${all.length})</button>${Object.entries(T).map(([k, m]) => `<button class="pill ${waFilter === k ? 'active' : ''}" data-act="wa-filter" data-k="${k}">${m.label} (${count(k)})</button>`).join('')}</div>
      ${list.length ? `<div class="list">${list.map(r => `<div class="item"><div class="avatar ${r.type === 'cobranca' ? '' : 'orange'}">${esc(U.initials(r.customer.name))}</div>
        <div class="grow"><div class="title">${esc(r.customer.name)} ${UI.chip(T[r.type].label, T[r.type].cls)}</div><div class="sub">${esc(r.reason)}</div>${wa(r.customer) ? '' : '<div class="sub down">Sem telefone/WhatsApp cadastrado</div>'}</div>
        <div class="right"><button class="btn sm primary" data-act="wa-open" data-key="${esc(r.key)}">Enviar WhatsApp</button><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm ghost" data-act="wa-skip" data-key="${esc(r.key)}" data-days="3">Adiar 3 dias</button><button class="btn sm ghost" data-act="wa-skip" data-key="${esc(r.key)}" data-days="30">Ignorar</button></div></div></div>`).join('')}</div>`
        : `<div class="card">${UI.empty('💬', all.length ? 'Nada neste filtro' : 'Nenhum contato pendente', all.length ? 'Escolha outro tipo acima.' : 'Quando um cliente sumir, uma cobrança vencer, uma proposta ficar sem resposta ou alguém fizer aniversário, ele aparece aqui.')}</div>`}
      <p class="small muted">Envie apenas para clientes que já têm relacionamento com você. O envio é sempre manual: você revisa a mensagem antes de abrir o WhatsApp.</p>`;
  };
  A['wa-filter'] = d => { waFilter = d.k; refresh(); };
  A['wa-skip'] = async d => { await PE.actions.mark(d.key.replace(/^wa:/, 'ws:'), Number(d.days)); refresh(); UI.toast(Number(d.days) > 3 ? 'Contato ignorado por 30 dias.' : 'Adiado por 3 dias.'); };
  A['wa-open'] = d => {
    const r = E.reminders(S).find(x => x.key === d.key); if (!r) return refresh();
    const msg = E.waRender(E.waTemplate(S, r.type), r.vars), link = wa(r.customer);
    UI.modal({ title: `Mensagem para ${r.customer.name}`, body: `<div class="row wrap">${UI.chip(E.waTypes[r.type].label, E.waTypes[r.type].cls)}<span class="small muted">${esc(r.reason)}</span></div>
      ${link ? '' : `<div class="alert attention"><span class="dot"></span><div><div class="a-title">Cliente sem WhatsApp cadastrado</div><div class="a-detail">Adicione o telefone para abrir a conversa.</div><div class="a-actions"><button class="btn sm ghost" data-act="cust-edit" data-id="${r.customer.id}">Editar cliente</button></div></div></div>`}
      <div class="field"><label>Mensagem (você pode editar)</label><textarea class="input" id="wa-msg" rows="6">${esc(msg)}</textarea><span class="hint">Ao abrir o WhatsApp, este contato é marcado como enviado e sai da fila.</span></div>
      <div class="modal-foot"><button class="btn ghost" data-act="close-modal">Cancelar</button><button class="btn ghost" id="wa-copy">Copiar</button><button class="btn primary" id="wa-go" ${link ? '' : 'disabled'}>Abrir WhatsApp</button></div>`,
      onMount: m => {
        m.querySelector('#wa-copy').onclick = async () => { try { await navigator.clipboard.writeText(m.querySelector('#wa-msg').value); UI.toast('Mensagem copiada.'); } catch { UI.toast('Não foi possível copiar.', 'err'); } };
        m.querySelector('#wa-go').onclick = async e => {
          window.open(`${link}?text=${encodeURIComponent(m.querySelector('#wa-msg').value)}`, '_blank', 'noopener');
          await UI.run(async () => { await PE.actions.mark(r.key, E.waTypes[r.type].cooldown); UI.closeModal(); refresh(); UI.toast('Marcado como enviado.'); }, e.currentTarget);
        };
      } });
  };
  A['wa-templates'] = () => {
    const fields = Object.entries(E.waTypes).map(([k, m]) => ({ name: k, label: m.label, type: 'textarea', full: true }));
    const values = Object.fromEntries(Object.keys(E.waTypes).map(k => [k, E.waTemplate(S, k)]));
    UI.form({ title: 'Mensagens de WhatsApp', fields, values, submitLabel: 'Salvar mensagens',
      extraFooter: '<button type="button" class="btn ghost" data-act="wa-tpl-reset" style="margin-right:auto">Restaurar padrão</button>',
      onSubmit: async v => { const wa_templates = {}; Object.keys(E.waTypes).forEach(k => { wa_templates[k] = v[k] || E.waDefaults[k]; }); await PE.db.saveCompany({ settings: { ...(S.company.settings || {}), wa_templates } }); UI.closeModal(); refresh(); UI.toast('Mensagens salvas.'); } });
    document.querySelector('.modal-body').insertAdjacentHTML('afterbegin', '<p class="small muted">Variáveis: {nome} {empresa} {valor} {vencimento} {titulo} {produto} {dias}. Elas são trocadas pelos dados de cada cliente.</p>');
  };
  A['wa-tpl-reset'] = async () => { const { wa_templates, ...rest } = S.company.settings || {}; await PE.db.saveCompany({ settings: rest }); UI.closeModal(); refresh(); UI.toast('Mensagens restauradas.'); };

  /* ---------- MARKETING E CAMPANHAS ---------- */
  const MK = E.mk;
  tabs.marketing = 'campanhas';
  const campStatusChip = c => UI.chip(MK.statusMeta[c.status]?.label || c.status, MK.statusMeta[c.status]?.cls || '');
  const firstOf = n => String(n || '').trim().split(/\s+/)[0] || 'tudo bem';
  const personalize = (msg, c) => String(msg).replace(/\{nome\}/g, firstOf(c.name));

  VIEWS.marketing = () => {
    const tab = tabs.marketing;
    const head = `<div class="page-head"><div><h1>Marketing</h1><p class="muted">Informe produto, preço, público e objetivo. O Prumo prepara a campanha.</p></div><button class="btn primary" data-act="camp-new">${UI.ico('plus', 16)} Criar campanha</button></div>
      <div class="filters">${[['campanhas', 'Campanhas'], ['agenda', 'Agenda de datas'], ['local', 'Marketing local']].map(([k, l]) => `<button class="pill ${tab === k ? 'active' : ''}" data-act="tab" data-v="marketing" data-t="${k}">${l}</button>`).join('')}</div>`;

    if (tab === 'agenda') {
      const dates = MK.upcomingDates(150);
      const camps = S.campaigns.filter(c => c.starts_at && c.status !== 'encerrada');
      const ev = [...dates.map(d => ({ date: d.date, kind: 'date', d })), ...camps.map(c => ({ date: c.starts_at, kind: 'camp', c }))].sort((a, b) => a.date.localeCompare(b.date));
      return head + (ev.length ? `<div class="list">${ev.map(e => e.kind === 'camp'
        ? `<div class="item clickable" data-act="camp-open" data-id="${e.c.id}"><div class="avatar orange">${UI.ico('megaphone', 18)}</div><div class="grow"><div class="title">${esc(e.c.name)}</div><div class="sub">Campanha · ${U.fmtDate(e.c.starts_at)}${e.c.ends_at ? ' a ' + U.fmtDate(e.c.ends_at) : ''}</div></div>${campStatusChip(e.c)}</div>`
        : `<div class="item"><div class="avatar">${UI.ico('tag', 18)}</div><div class="grow"><div class="title">${esc(e.d.name)} ${UI.chip(e.d.days === 0 ? 'hoje' : `em ${e.d.days} dias`, e.d.days <= 21 ? 'orange' : '')}</div><div class="sub">${U.fmtDate(e.d.date)} · ${esc(e.d.tip)}</div></div><button class="btn sm soft" data-act="camp-new" data-occasion="${esc(e.d.name)}" data-date="${e.d.date}">Criar campanha</button></div>`).join('')}</div>`
        : `<div class="card">${UI.empty('📅', 'Nada por aqui', 'Nenhuma data comercial nos próximos meses.')}</div>`);
    }

    if (tab === 'local') {
      const cities = {}; S.customers.forEach(c => { if (c.city) cities[c.city] = (cities[c.city] || 0) + 1; });
      const cityRows = Object.entries(cities).sort((a, b) => b[1] - a[1]);
      const recentes = MK.audience(S, 'recentes').length;
      return head + `<div class="grid cols-2">
        <div class="card stack"><div class="card-title"><h2>Campanhas por cidade</h2></div>${cityRows.length ? `<div class="list">${cityRows.map(([c, n]) => `<div class="item"><div class="avatar">${UI.ico('users', 18)}</div><div class="grow"><div class="title">${esc(c)}</div><div class="sub">${n} cliente${n > 1 ? 's' : ''}</div></div><button class="btn sm soft" data-act="camp-new" data-audience="city:${esc(c)}" data-objective="promocao">Criar campanha</button></div>`).join('')}</div>` : '<p class="muted small">Cadastre a cidade dos seus clientes para criar ofertas locais.</p>'}</div>
        <div class="stack"><div class="card stack"><div class="card-title"><h2>Coletar avaliações</h2></div><p class="small muted">${recentes} cliente${recentes === 1 ? '' : 's'} comprou nos últimos 30 dias. Peça uma avaliação enquanto a experiência está fresca.</p><button class="btn primary" data-act="camp-new" data-objective="avaliacoes" data-audience="recentes">Pedir avaliações</button></div>
        <div class="card stack"><div class="card-title"><h2>Google Meu Negócio</h2>${UI.chip('Em breve')}</div><p class="small muted">Integração para responder avaliações e publicar ofertas direto no Google está planejada. Por enquanto, cole o link de avaliação ao criar a campanha de avaliações.</p></div></div></div>`;
    }

    // Campanhas + sugestões
    const idle = S.products.map(p => ({ p, st: E.productStats(S, p) })).filter(x => x.st.idle).sort((a, b) => b.st.stockValue - a.st.stockValue)[0];
    const sumidos = MK.audience(S, 'sumidos').length, aniv = MK.audience(S, 'aniversariantes').length, nextDate = MK.upcomingDates(45)[0];
    const sug = [
      idle && { t: `Girar ${idle.p.name}`, d: `${U.brl0(idle.st.stockValue)} parados em estoque há 90+ dias.`, a: `data-objective="estoque" data-product="${idle.p.id}" data-audience="ativos"` },
      sumidos && { t: `Recuperar ${sumidos} cliente${sumidos > 1 ? 's' : ''}`, d: 'Sem comprar há 60 dias ou mais.', a: 'data-objective="recuperacao" data-audience="sumidos"' },
      aniv && { t: `${aniv} aniversariante${aniv > 1 ? 's' : ''} no mês`, d: 'Um presente aproxima e vende.', a: 'data-objective="aniversario" data-audience="aniversariantes"' },
      nextDate && { t: `${nextDate.name} em ${nextDate.days} dias`, d: nextDate.tip, a: `data-occasion="${esc(nextDate.name)}" data-date="${nextDate.date}"` }
    ].filter(Boolean).slice(0, 3);
    const camps = [...S.campaigns].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return head + (sug.length ? `<div class="stack" style="gap:8px"><h3>Sugestões para você</h3><div class="grid cols-3">${sug.map(s => `<div class="card flat stack" style="gap:6px"><strong>${esc(s.t)}</strong><p class="small muted">${esc(s.d)}</p><button class="btn sm soft" data-act="camp-new" ${s.a}>Criar campanha</button></div>`).join('')}</div></div>` : '')
      + (camps.length ? `<div class="stack" style="gap:8px"><h3>Suas campanhas</h3><div class="list">${camps.map(c => { const r = MK.results(S, c), size = MK.audience(S, c.audience).length; return `<div class="item clickable" data-act="camp-open" data-id="${c.id}"><div class="avatar orange">${UI.ico('megaphone', 18)}</div><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(MK.audienceLabel(S, c.audience))} (${size}) · ${esc(c.channel || 'WhatsApp')}${c.ends_at ? ' · até ' + U.fmtShort(c.ends_at) : ''}</div></div><div class="right">${campStatusChip(c)}<div class="small muted" style="margin-top:4px">${r.sent}/${size} contatos · ${r.converted} compraram</div></div></div>`; }).join('')}</div></div>`
        : `<div class="card">${UI.empty('📣', 'Nenhuma campanha ainda', 'Crie a primeira: escolha o produto, o preço e o público. A mensagem sai pronta.', '<button class="btn primary" data-act="camp-new">Criar campanha</button>')}</div>`);
  };

  A['camp-new'] = d => {
    const prods = S.products.filter(p => p.active !== false);
    const fields = [
      { name: 'objective', label: 'Objetivo', type: 'select', options: Object.entries(MK.objectives).map(([k, o]) => [k, `${o.label} — ${o.hint}`]), full: true },
      { name: 'product_id', label: 'Produto (opcional)', type: 'select', options: [['', '— sem produto —'], ...prods.map(p => [p.id, `${p.name} — ${U.brl(p.price)}`])], full: true },
      { name: 'price', label: 'Preço da oferta (R$)', type: 'number', step: '0.01', min: 0 }, { name: 'audience', label: 'Público', type: 'select', options: MK.audienceOptions(S) },
      { name: 'channel', label: 'Canal principal', type: 'select', options: MK.channels }, { name: 'starts_at', label: 'Início', type: 'date', required: true }, { name: 'ends_at', label: 'Fim', type: 'date' },
      { name: 'link', label: 'Link de avaliação (só para “Pedir avaliações”)', placeholder: 'https://g.page/...', full: true }
    ];
    const start = d.date ? (U.addDays(d.date, -7) < U.today() ? U.today() : U.addDays(d.date, -7)) : U.today();
    UI.form({ title: d.occasion ? `Campanha — ${d.occasion}` : 'Criar campanha', fields, submitLabel: 'Preparar campanha',
      values: { objective: d.objective || 'promocao', product_id: d.product || '', audience: d.audience || 'todos', channel: 'WhatsApp', starts_at: start, ends_at: d.date || U.addDays(start, 7) },
      onSubmit: async v => {
        const product = S.products.find(p => p.id === v.product_id) || null;
        const gen = MK.generate(S, { objective: v.objective, product, price: v.price, audience: v.audience, channel: v.channel, starts: v.starts_at, ends: v.ends_at, link: v.link, occasion: d.occasion });
        const camp = await PE.db.insert('campaigns', { name: gen.name, objective: v.objective, audience: v.audience, product_id: product?.id || null, price: v.price || null, message: gen.message, caption: gen.caption, channel: v.channel, status: 'ativa', starts_at: v.starts_at, ends_at: v.ends_at || null });
        UI.closeModal(); tabs.marketing = 'campanhas'; if (view !== 'marketing') location.hash = '#/marketing'; else refresh();
        UI.toast('Campanha preparada!'); A['camp-open']({ id: camp.id });
      } });
    const form = document.getElementById('pe-form'), sel = form.elements.product_id, price = form.elements.price;
    const hint = document.createElement('span'); hint.className = 'hint'; hint.id = 'mk-hint'; price.parentElement.appendChild(hint);
    const showMargin = () => { const p = S.products.find(x => x.id === sel.value), m = MK.margin(p, price.value); hint.style.color = ''; hint.textContent = m ? `Margem nesta oferta: ${U.pct(m.pct, 0)} (lucro de ${U.brl(m.profit)} por unidade)${m.profit <= 0 ? ' — PREJUÍZO' : m.pct < 10 ? ' — margem muito baixa' : ''}` : ''; if (m && m.profit <= 0) hint.style.color = 'var(--red)'; };
    sel.addEventListener('change', () => { const p = S.products.find(x => x.id === sel.value); if (p) price.value = form.elements.objective.value === 'lancamento' ? p.price : MK.promoPrice(S, p); showMargin(); });
    price.addEventListener('input', showMargin);
    if (d.product) { const p = S.products.find(x => x.id === d.product); if (p) { price.value = MK.promoPrice(S, p); showMargin(); } }
  };

  A['camp-open'] = d => {
    const c = S.campaigns.find(x => x.id === d.id); if (!c) return;
    const product = S.products.find(p => p.id === c.product_id), aud = MK.audience(S, c.audience), m = MK.margin(product, c.price);
    const kpis = () => { const r = MK.results(S, c); return `${kpi('Contatos enviados', `${r.sent}/${aud.length}`, '', 'orange')}${kpi('Contatados que compraram', r.converted, r.converted ? `<span class="up">${U.brl0(r.convValue)}</span>` : '<span class="muted">após o contato</span>', 'green')}${product ? kpi('Vendas do produto', U.brl0(r.prodRev), `<span class="muted">${r.prodQty} un. no período</span>`, 'black') : ''}`; };
    const audRow = (cu, sent) => `<div class="item" data-cust-row="${cu.id}"><div class="avatar">${esc(U.initials(cu.name))}</div><div class="grow"><div class="title">${esc(cu.name)}</div><div class="sub">${esc(cu.city || '')}${wa(cu) ? '' : ' · sem WhatsApp'}</div></div>${sent ? UI.chip('Enviado', 'green') : wa(cu) ? `<button class="btn sm primary" data-act="camp-send" data-camp="${c.id}" data-cust="${cu.id}">WhatsApp</button>` : UI.chip('Sem telefone', 'yellow')}</div>`;
    const r0 = MK.results(S, c);
    UI.modal({ title: c.name, wide: true, body: `<div class="row wrap">${campStatusChip(c)}${UI.chip(MK.objectives[c.objective]?.label || c.objective)}${UI.chip(c.channel || 'WhatsApp')}${UI.chip(MK.audienceLabel(S, c.audience) + ` (${aud.length})`)}${c.ends_at ? UI.chip('até ' + U.fmtShort(c.ends_at)) : ''}</div>
      ${m ? `<div class="alert ${m.profit <= 0 ? 'urgent' : m.pct < Number(S.company.target_margin || 30) / 2 ? 'attention' : 'opportunity'}"><span class="dot"></span><div><div class="a-title">Oferta de ${esc(product.name)} por ${U.brl(c.price)}: margem de ${U.pct(m.pct, 0)}</div><div class="a-detail">Lucro de ${U.brl(m.profit)} por unidade${m.profit <= 0 ? '. Você perde dinheiro em cada venda: reveja o preço.' : m.pct < 10 ? '. Margem apertada: use por tempo curto.' : '.'}</div></div></div>` : ''}
      <div class="grid cols-3 keep" id="camp-kpis">${kpis()}</div>
      <div class="field"><label>Mensagem de WhatsApp (use {nome} para o nome do cliente)</label><textarea class="input" id="camp-msg" rows="5">${esc(c.message || '')}</textarea></div>
      <div class="field"><label>Legenda para Instagram / Facebook</label><textarea class="input" id="camp-cap" rows="6">${esc(c.caption || '')}</textarea></div>
      <div class="row wrap"><button class="btn primary sm" data-act="camp-save-text" data-id="${c.id}">Salvar textos</button><button class="btn ghost sm" data-act="copy-el" data-el="camp-msg">Copiar mensagem</button><button class="btn ghost sm" data-act="copy-el" data-el="camp-cap">Copiar legenda</button></div>
      <div><div class="row between"><h3>Público (${aud.length})</h3><span class="small muted">Você revisa e envia cada mensagem</span></div><div class="list" style="margin-top:8px;max-height:320px;overflow-y:auto">${aud.length ? aud.slice(0, 100).map(cu => audRow(cu, r0.sentIds.has(cu.id))).join('') : '<p class="muted small">Nenhum cliente neste público ainda.</p>'}</div></div>
      <div class="row wrap"><button class="btn sm ghost" data-act="camp-edit" data-id="${c.id}">Editar dados</button><button class="btn sm ghost" data-act="camp-status" data-id="${c.id}">${c.status === 'encerrada' ? 'Reativar' : 'Encerrar campanha'}</button><button class="btn sm danger" data-act="camp-del" data-id="${c.id}">Excluir</button></div>` });
  };
  A['copy-el'] = async d => { try { await navigator.clipboard.writeText(document.getElementById(d.el).value); UI.toast('Copiado.'); } catch { UI.toast('Não foi possível copiar.', 'err'); } };
  A['camp-save-text'] = async d => { await PE.db.update('campaigns', d.id, { message: document.getElementById('camp-msg').value, caption: document.getElementById('camp-cap').value }); UI.toast('Textos salvos.'); };
  A['camp-send'] = d => {
    const c = S.campaigns.find(x => x.id === d.camp), cu = S.customers.find(x => x.id === d.cust), link = wa(cu); if (!link) return;
    const msg = personalize(document.getElementById('camp-msg')?.value || c.message, cu);
    window.open(`${link}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    return PE.actions.mark(`cp:${c.id}:${cu.id}`, 365).then(() => {
      const row = document.querySelector(`[data-cust-row="${cu.id}"]`); if (row) row.querySelector('.btn')?.replaceWith(Object.assign(document.createElement('span'), { className: 'chip green', textContent: 'Enviado' }));
      const k = document.getElementById('camp-kpis'); if (k) { const aud = MK.audience(S, c.audience), product = S.products.find(p => p.id === c.product_id), r = MK.results(S, c); k.innerHTML = `${kpi('Contatos enviados', `${r.sent}/${aud.length}`, '', 'orange')}${kpi('Contatados que compraram', r.converted, '<span class="muted">após o contato</span>', 'green')}${product ? kpi('Vendas do produto', U.brl0(r.prodRev), `<span class="muted">${r.prodQty} un. no período</span>`, 'black') : ''}`; }
    });
  };
  A['camp-edit'] = d => {
    const c = S.campaigns.find(x => x.id === d.id); UI.closeModal();
    UI.form({ title: 'Editar campanha', values: c, fields: [{ name: 'name', label: 'Nome', required: true, full: true }, { name: 'price', label: 'Preço da oferta (R$)', type: 'number', step: '0.01' }, { name: 'channel', label: 'Canal', type: 'select', options: MK.channels }, { name: 'starts_at', label: 'Início', type: 'date' }, { name: 'ends_at', label: 'Fim', type: 'date' }, { name: 'status', label: 'Situação', type: 'select', options: [['rascunho', 'Rascunho'], ['ativa', 'Ativa'], ['encerrada', 'Encerrada']] }],
      onSubmit: async v => { await PE.db.update('campaigns', c.id, { ...v, price: v.price || null }); UI.closeModal(); refresh(); A['camp-open']({ id: c.id }); } });
  };
  A['camp-status'] = async d => { const c = S.campaigns.find(x => x.id === d.id); await PE.db.update('campaigns', c.id, { status: c.status === 'encerrada' ? 'ativa' : 'encerrada' }); UI.closeModal(); refresh(); UI.toast(c.status === 'encerrada' ? 'Campanha reativada.' : 'Campanha encerrada.'); };
  A['camp-del'] = d => { UI.closeModal(); UI.confirm('Excluir esta campanha e o histórico de envios dela?', async () => { for (const n of S.notifications.filter(n => n.alert_key.startsWith(`cp:${d.id}:`))) await PE.db.remove('notifications', n.id); await PE.db.remove('campaigns', d.id); refresh(); UI.toast('Campanha excluída.'); }); };

  /* ---------- AUTOMAÇÕES ---------- */
  const AU = PE.auto;
  const AU_STAGES = Object.entries(AU.stageLabel);
  const AU_CATS = ['vendas', 'financeiro', 'marketing', 'estoque', 'administrativo'];
  const autoFlow = a => `<div class="small" style="margin-top:6px;line-height:1.7"><span class="flow-tag">QUANDO</span> ${esc(AU.describeTrigger(a.trigger || {}))}${(a.actions || []).map((x, i) => `<br><span class="flow-tag">${i ? 'E' : 'ENTÃO'}</span> ${esc(AU.describeAction(x))}`).join('')}</div>`;

  VIEWS.automacoes = () => {
    const list = S.automations, active = list.filter(a => a.active).length, runs = AU.runs(S, null, 30);
    const used = new Set(list.map(a => a.trigger?.preset).filter(Boolean));
    const presets = AU.presets.filter(p => !used.has(p.key));
    const recent = [...AU.runs(S, null, 30)].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 8);
    return `<div class="page-head"><div><h1>Automações</h1><p class="muted">Deixe o Prumo lembrar e agir por você: quando algo acontecer, ele cria a tarefa certa.</p></div>
        <div class="row wrap"><button class="btn ghost" data-act="auto-scan">Verificar agora</button><button class="btn primary" data-act="auto-new">${UI.ico('plus', 16)} Nova automação</button></div></div>
      <div class="grid cols-5" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi('Automações ativas', active, `<span class="muted">de ${list.length}</span>`, 'orange')}${kpi('Execuções em 30 dias', runs.length, '', 'black')}${kpi('Última verificação', AU.lastScan ? new Date(AU.lastScan).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—', '<span class="muted">ao abrir o app</span>')}</div>
      ${presets.length ? `<div class="stack" style="gap:8px"><h3>Comece por aqui</h3><div class="grid cols-2">${presets.map(p => `<div class="card flat stack" style="gap:6px"><strong>${esc(p.name)}</strong><p class="small muted">${esc(p.why)}</p>${autoFlow({ trigger: p.trigger, actions: p.actions })}<div><button class="btn sm soft" data-act="auto-preset" data-key="${p.key}">Ativar</button></div></div>`).join('')}</div></div>` : ''}
      ${list.length ? `<div class="stack" style="gap:8px"><h3>Suas automações</h3><div class="list">${list.map(a => `<div class="item" style="align-items:flex-start"><div class="avatar ${a.active ? 'orange' : ''}">${UI.ico('bolt', 18)}</div><div class="grow"><div class="title">${esc(a.name)} ${a.active ? UI.chip('Ativa', 'green') : UI.chip('Pausada')}</div>${autoFlow(a)}<div class="small muted" style="margin-top:4px">${AU.runs(S, a.id, 30).length} execução(ões) nos últimos 30 dias</div></div>
        <div class="row wrap" style="justify-content:flex-end"><button class="btn sm ghost" data-act="auto-toggle" data-id="${a.id}">${a.active ? 'Pausar' : 'Ativar'}</button><button class="btn sm ghost" data-act="auto-edit" data-id="${a.id}">Editar</button><button class="btn sm danger" data-act="auto-del" data-id="${a.id}">Excluir</button></div></div>`).join('')}</div></div>`
        : `<div class="card">${UI.empty('⚡', 'Nenhuma automação ainda', 'Ative uma das sugestões acima ou monte a sua com QUANDO → ENTÃO.')}</div>`}
      ${recent.length ? `<div class="stack" style="gap:8px"><h3>Últimas execuções</h3><div class="list">${recent.map(n => { const [, aid, ent] = n.alert_key.split(':'), a = S.automations.find(x => x.id === aid); const ref = S.customers.find(c => c.id === ent)?.name || S.products.find(p => p.id === ent)?.name || S.opportunities.find(o => o.id === ent)?.title || S.transactions.find(t => t.id === ent)?.description || ''; return `<div class="item"><div class="grow"><div class="title">${esc(a?.name || 'Automação removida')}</div><div class="sub">${esc(ref)}</div></div><span class="chip">${U.fmtDate((n.created_at || '').slice(0, 10))}</span></div>`; }).join('')}</div></div>` : ''}
      <p class="small muted">Eventos (comprar, cadastrar cliente, mudar de etapa) disparam na hora. Condições (dias sem comprar, conta vencendo, estoque baixo) são verificadas quando alguém da gerência abre o app, no máximo a cada 5 minutos. Cada item é tratado uma vez, sem repetição.</p>`;
  };

  const autoFields = () => [
    { name: 'name', label: 'Nome da automação', required: true, full: true, placeholder: 'Ex.: Cliente sumido vira tarefa' },
    { name: 't_type', label: 'QUANDO', type: 'select', options: Object.entries(AU.triggers).map(([k, t]) => [k, t.label]), full: true },
    { name: 't_days', label: 'Quantos dias?', type: 'number', min: 0, step: '1' },
    { name: 't_stage', label: 'Etapa', type: 'select', options: [['', 'Qualquer etapa'], ...AU_STAGES] },
    { name: 'a1_type', label: 'ENTÃO', type: 'select', options: Object.entries(AU.actionTypes), full: true },
    { name: 'a1_title', label: 'Título (pode usar variáveis)', required: true, full: true, hint: 'Variáveis: ' + AU.vars },
    { name: 'a1_category', label: 'Categoria da tarefa', type: 'select', options: AU_CATS }, { name: 'a1_priority', label: 'Prioridade', type: 'select', options: [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] },
    { name: 'a1_due', label: 'Prazo (dias a partir de hoje)', type: 'number', min: 0, step: '1' }, { name: 'a1_value', label: 'Valor da oportunidade (R$)', type: 'number', min: 0, step: '0.01' },
    { name: 'a2_type', label: 'E (ação extra, opcional)', type: 'select', options: [['', '— nenhuma —'], ...Object.entries(AU.actionTypes)], full: true },
    { name: 'a2_title', label: 'Título da ação extra', full: true }, { name: 'a2_due', label: 'Prazo da ação extra (dias)', type: 'number', min: 0, step: '1' }
  ];
  const autoToValues = a => { const t = a.trigger || {}, x = a.actions?.[0] || { params: {} }, y = a.actions?.[1]; return { name: a.name, t_type: t.type, t_days: t.params?.days ?? '', t_stage: t.params?.stage || '', a1_type: x.type, a1_title: x.params?.title, a1_category: x.params?.category || 'vendas', a1_priority: x.params?.priority || 'media', a1_due: x.params?.due_days ?? 0, a1_value: x.params?.value ?? '', a2_type: y?.type || '', a2_title: y?.params?.title || '', a2_due: y?.params?.due_days ?? 0 }; };
  const autoFromForm = (v, preset) => {
    const meta = AU.triggers[v.t_type], params = {};
    if (meta.days !== undefined) params.days = v.t_days ?? meta.days;
    if (meta.stage && v.t_stage) params.stage = v.t_stage;
    const actions = [{ type: v.a1_type, params: { title: v.a1_title, category: v.a1_category || 'vendas', priority: v.a1_priority || 'media', due_days: v.a1_due || 0, ...(v.a1_type === 'criar_oportunidade' && v.a1_value ? { value: v.a1_value } : {}) } }];
    if (v.a2_type && v.a2_title) actions.push({ type: v.a2_type, params: { title: v.a2_title, category: 'vendas', priority: 'media', due_days: v.a2_due || 0 } });
    return { name: v.name, trigger: { type: v.t_type, params, ...(preset ? { preset } : {}) }, actions };
  };
  /** Mostra só os campos que fazem sentido para o gatilho e a ação escolhidos. */
  const autoFormBehavior = () => {
    const f = document.getElementById('pe-form'); if (!f) return;
    const box = n => f.elements[n]?.closest('.field'), show = (n, on) => box(n) && (box(n).style.display = on ? '' : 'none');
    const sync = () => {
      const t = AU.triggers[f.elements.t_type.value], a1 = f.elements.a1_type.value;
      show('t_days', t.days !== undefined); if (t.days !== undefined) box('t_days').querySelector('label').textContent = t.daysLabel;
      show('t_stage', !!t.stage); show('a1_category', a1 === 'criar_tarefa'); show('a1_priority', a1 === 'criar_tarefa'); show('a1_value', a1 === 'criar_oportunidade');
      const a2 = f.elements.a2_type.value; show('a2_title', !!a2); show('a2_due', !!a2);
    };
    f.elements.t_type.addEventListener('change', () => { const t = AU.triggers[f.elements.t_type.value]; if (t.days !== undefined && f.elements.t_days.value === '') f.elements.t_days.value = t.days; sync(); });
    ['a1_type', 'a2_type'].forEach(n => f.elements[n].addEventListener('change', sync)); sync();
  };
  const autoSave = async (v, existing) => {
    const t = AU.triggers[v.t_type];
    if (t.days !== undefined && (v.t_days === null || v.t_days < 0)) throw new Error('Informe os dias.');
    const data = autoFromForm(v, existing?.trigger?.preset);
    if (existing) await PE.db.update('automations', existing.id, data); else await PE.db.insert('automations', { ...data, active: true });
    UI.closeModal(); refresh();
    const n = await AU.runScan(true); if (n) refresh();
    UI.toast(existing ? 'Automação atualizada.' : 'Automação criada e ativa.');
  };
  A['auto-new'] = () => { UI.form({ title: 'Nova automação', fields: autoFields(), submitLabel: 'Criar automação', values: { t_type: 'cliente_sem_comprar', t_days: 90, a1_type: 'criar_tarefa', a1_category: 'vendas', a1_priority: 'media', a1_due: 1 }, onSubmit: v => autoSave(v) }); autoFormBehavior(); };
  A['auto-edit'] = d => { const a = S.automations.find(x => x.id === d.id); UI.form({ title: 'Editar automação', fields: autoFields(), values: autoToValues(a), onSubmit: v => autoSave(v, a) }); autoFormBehavior(); };
  A['auto-preset'] = async d => {
    const p = AU.presets.find(x => x.key === d.key);
    await PE.db.insert('automations', { name: p.name, trigger: { ...p.trigger, preset: p.key }, actions: p.actions, active: true });
    refresh(); const n = await AU.runScan(true); refresh(); UI.toast(n ? `Automação ativa: ${n} ação(ões) já executada(s).` : 'Automação ativa.');
  };
  A['auto-toggle'] = async d => { const a = S.automations.find(x => x.id === d.id); await PE.db.update('automations', a.id, { active: !a.active }); refresh(); if (!a.active) { const n = await AU.runScan(true); if (n) refresh(); } };
  A['auto-del'] = d => UI.confirm('Excluir esta automação? As tarefas que ela já criou permanecem.', async () => { await PE.db.remove('automations', d.id); refresh(); UI.toast('Automação excluída.'); });
  A['auto-scan'] = async (_d, btn) => UI.run(async () => { const n = await AU.runScan(true); refresh(); UI.toast(n ? `${n} ação(ões) executada(s).` : 'Nada novo para executar agora.'); }, btn);

  // Resumo único quando várias automações disparam de uma vez
  let auQueue = [], auTimer = null;
  AU.onRun = (a, made) => {
    auQueue.push(...made); clearTimeout(auTimer);
    auTimer = setTimeout(() => { const n = auQueue.length; auQueue = []; if (n) UI.toast(`Automações criaram ${n} ite${n === 1 ? 'm' : 'ns'} (veja em Tarefas).`); refresh(); }, 500);
  };

  /* ---------- EQUIPE E PERMISSÕES ---------- */
  const roleOpts = Object.entries(PE.perm.roles).map(([k, r]) => [k, r.label]);
  const roleChip = r => UI.chip(PE.perm.roles[r]?.label || r, { administrador: 'black', gerente: 'orange', vendedor: 'blue', financeiro: 'green' }[r] || '');
  const memberName = m => m.name || m.email || 'Usuário';
  const memberOf = uid => S.members.find(m => m.user_id === uid);
  const appLink = () => location.origin + location.pathname;

  VIEWS.equipe = () => {
    const team = E.team(S), invites = S.invites.filter(i => i.status === 'pending'), manage = PE.perm.can('team.manage'), me = PE.db.user?.id;
    const totalRev = team.reduce((s, t) => s + t.rev, 0), owner = S.company.owner_id;
    const roles = Object.keys(PE.perm.roles), mods = Object.keys(PE.perm.moduleLabels);
    return `<div class="page-head"><div><h1>Equipe e permissões</h1><p class="muted">Cada pessoa vê e faz só o que o perfil dela permite.</p></div>${manage ? `<button class="btn primary" data-act="team-invite">${UI.ico('plus', 16)} Convidar pessoa</button>` : ''}</div>
      <div class="grid cols-5" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi('Pessoas na equipe', S.members.length, '', 'orange')}${kpi('Convites pendentes', invites.length, '', 'black')}${kpi('Vendas da equipe no mês', U.brl0(totalRev), '', 'green')}</div>
      ${PE.db.mode === 'demo' ? `<div class="alert info"><span class="dot"></span><div><div class="a-title">Modo demonstração</div><div class="a-detail">Use o seletor “Ver como” no topo da tela para testar o que cada perfil enxerga. Com o Supabase conectado, as permissões valem de verdade no banco.</div></div></div>` : ''}
      <div class="stack" style="gap:8px"><h3>Pessoas</h3><div class="list">${team.map(t => {
        const m = t.m, isOwner = m.user_id === owner, isMe = m.user_id === me;
        return `<div class="item" style="align-items:flex-start"><div class="avatar ${isOwner ? 'orange' : ''}">${esc(U.initials(memberName(m)))}</div><div class="grow"><div class="title">${esc(memberName(m))} ${roleChip(m.role)}${isMe ? ' ' + UI.chip('Você') : ''}${isOwner ? ' ' + UI.chip('Dono') : ''}</div><div class="sub">${esc(m.email || '')}</div>
          <div class="small muted" style="margin-top:6px">Mês: ${t.count} venda${t.count === 1 ? '' : 's'} · ${U.brl0(t.rev)} · Tarefas: ${t.done30} concluída${t.done30 === 1 ? '' : 's'} (30d), ${t.open} aberta${t.open === 1 ? '' : 's'}${t.late ? `, <span class="down">${t.late} atrasada${t.late === 1 ? '' : 's'}</span>` : ''}</div>
          ${t.goal ? `<div style="margin-top:8px"><div class="progress"><span style="width:${Math.min(100, t.pct)}%"></span></div><div class="small muted" style="margin-top:4px">Meta ${U.brl0(t.goal)} · ${U.pct(t.pct, 0)} atingido</div></div>` : ''}</div>
          ${manage ? `<div class="row"><button class="btn sm ghost" data-act="team-edit" data-id="${m.id}">Editar</button>${!isOwner && !isMe ? `<button class="btn sm danger" data-act="team-remove" data-id="${m.id}">Remover</button>` : ''}</div>` : ''}</div>`;
      }).join('')}</div></div>
      ${invites.length ? `<div class="stack" style="gap:8px"><h3>Convites pendentes</h3><div class="list">${invites.map(i => `<div class="item"><div class="avatar">${UI.ico('chat', 18)}</div><div class="grow"><div class="title">${esc(i.email)} ${roleChip(i.role)}</div><div class="sub">Entra na equipe quando criar conta ou entrar com este e-mail</div></div>${manage ? `<div class="row"><button class="btn sm soft" data-act="invite-share" data-id="${i.id}">Enviar convite</button><button class="btn sm ghost" data-act="invite-revoke" data-id="${i.id}">Revogar</button></div>` : ''}</div>`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-title"><h2>O que cada perfil acessa</h2></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:14px">${roles.map(r => `<div class="card flat" style="padding:12px"><div>${roleChip(r)}</div><p class="small muted" style="margin-top:6px">${esc(PE.perm.roles[r].desc)}</p></div>`).join('')}</div>
        <div class="table-wrap"><table><thead><tr><th>Área</th>${roles.map(r => `<th>${esc(PE.perm.roles[r].label)}</th>`).join('')}</tr></thead><tbody>${mods.map(md => `<tr><td>${esc(PE.perm.moduleLabels[md])}</td>${roles.map(r => `<td>${PE.perm.modules[r].includes(md) ? '<span class="up">✓</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  };

  A['team-invite'] = () => UI.form({ title: 'Convidar pessoa', submitLabel: 'Criar convite', values: { role: 'vendedor' },
    fields: [{ name: 'email', label: 'E-mail da pessoa', type: 'email', required: true, full: true, hint: 'Ela precisa criar conta ou entrar com este mesmo e-mail.' }, { name: 'role', label: 'Perfil', type: 'select', options: roleOpts, full: true }],
    onSubmit: async v => {
      const email = v.email.toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Informe um e-mail válido.');
      if (S.members.some(m => (m.email || '').toLowerCase() === email)) throw new Error('Essa pessoa já faz parte da equipe.');
      if (S.invites.some(i => i.status === 'pending' && i.email.toLowerCase() === email)) throw new Error('Já existe um convite pendente para este e-mail.');
      const inv = await PE.db.insert('invites', { email, role: v.role, status: 'pending' });
      UI.closeModal(); refresh(); A['invite-share']({ id: inv.id });
    } });
  A['invite-share'] = d => {
    const i = S.invites.find(x => x.id === d.id); if (!i) return;
    const msg = `Oi! Você foi convidado(a) para a equipe da ${S.company.name} no Prumo, como ${PE.perm.roles[i.role].label}. Acesse ${appLink()} e crie sua conta (ou entre) usando este e-mail: ${i.email}`;
    UI.modal({ title: 'Convite criado', body: `<p class="muted">Quando <strong>${esc(i.email)}</strong> criar conta ou entrar com esse e-mail, entra direto na sua empresa como <strong>${esc(PE.perm.roles[i.role].label)}</strong>. Envie a mensagem abaixo:</p>
      <div class="field"><textarea class="input" id="inv-msg" rows="4">${esc(msg)}</textarea></div>
      <div class="modal-foot"><button class="btn ghost" data-act="close-modal">Fechar</button><button class="btn ghost" data-act="copy-el" data-el="inv-msg">Copiar</button><button class="btn primary" id="inv-wa">Enviar por WhatsApp</button></div>`,
      onMount: m => { m.querySelector('#inv-wa').onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(m.querySelector('#inv-msg').value)}`, '_blank', 'noopener'); } });
  };
  A['invite-revoke'] = d => UI.confirm('Revogar este convite? A pessoa não conseguirá mais entrar por ele.', async () => { await PE.db.update('invites', d.id, { status: 'revoked' }); refresh(); UI.toast('Convite revogado.'); }, 'Revogar');
  A['team-edit'] = d => {
    const m = S.members.find(x => x.id === d.id), locked = m.user_id === S.company.owner_id || m.user_id === PE.db.user?.id;
    const fields = [{ name: 'name', label: 'Nome', full: true }, ...(locked ? [] : [{ name: 'role', label: 'Perfil', type: 'select', options: roleOpts }]), { name: 'monthly_goal', label: 'Meta de vendas por mês (R$)', type: 'number', step: '0.01', min: 0, full: true, hint: 'Aparece como barra de progresso nesta tela.' }];
    UI.form({ title: `Editar — ${memberName(m)}`, fields, values: m, onSubmit: async v => {
      const patch = { name: v.name || m.name, monthly_goal: v.monthly_goal || null }; if (!locked && v.role) patch.role = v.role;
      await PE.db.update('members', m.id, patch); UI.closeModal(); refresh(); UI.toast('Pessoa atualizada.');
    } });
    if (locked) document.querySelector('.modal-body')?.insertAdjacentHTML('afterbegin', '<p class="small muted">O perfil do dono da empresa e o seu próprio perfil não podem ser alterados aqui.</p>');
  };
  A['team-remove'] = d => { const m = S.members.find(x => x.id === d.id); UI.confirm(`Remover ${memberName(m)} da equipe? A pessoa perde o acesso à empresa.`, async () => { await PE.db.remove('members', m.id); refresh(); UI.toast('Pessoa removida da equipe.'); }, 'Remover'); };

  /* ---------- PERMISSÕES NA INTERFACE ---------- */
  // Ação da tela -> permissão exigida. O banco também impõe (RLS); aqui só evitamos botões que não funcionariam.
  const PERM_ACTS = {
    'auto-new': 'auto.write', 'auto-edit': 'auto.write', 'auto-preset': 'auto.write', 'auto-toggle': 'auto.write', 'auto-del': 'auto.write', 'auto-scan': 'auto.write',
    'sale-new': 'sale.create', 'sale-cancel': 'sale.cancel', 'sale-receive': 'sale.receive',
    'cust-new': 'customer.write', 'cust-edit': 'customer.write', 'cust-del': 'customer.delete', 'cust-followup': 'customer.write',
    'opp-new': 'opp.write', 'opp-edit': 'opp.write', 'opp-move': 'opp.write', 'opp-del': 'opp.write', 'opp-lost': 'opp.write',
    'prod-new': 'product.write', 'prod-edit': 'product.write', 'prod-del': 'product.write', 'stock-adjust': 'stock.adjust', 'price-apply': 'product.write',
    'tx-new': 'finance.write', 'tx-edit': 'finance.write', 'tx-del': 'finance.write', 'tx-settle': 'finance.write',
    'camp-new': 'campaign.write', 'camp-edit': 'campaign.write', 'camp-status': 'campaign.write', 'camp-del': 'campaign.write', 'camp-save-text': 'campaign.write',
    'team-invite': 'team.manage', 'team-edit': 'team.manage', 'team-remove': 'team.manage', 'invite-revoke': 'team.manage', 'invite-share': 'team.manage'
  };
  Object.entries(PERM_ACTS).forEach(([act, perm]) => {
    const fn = A[act]; if (!fn) return;
    A[act] = (d, el) => PE.perm.can(perm) ? fn(d, el) : UI.toast('Seu perfil não tem permissão para isso.', 'err');
  });
  /** Remove da tela o que o perfil atual não pode usar. */
  function applyPerms(scope) {
    scope.querySelectorAll('[data-act]').forEach(el => {
      const perm = PERM_ACTS[el.dataset.act]; if (!perm || PE.perm.can(perm)) return;
      if (el.classList.contains('item')) { el.removeAttribute('data-act'); el.classList.remove('clickable'); } else el.remove();
    });
    scope.querySelectorAll('a[href^="#/"]').forEach(a => {
      const mod = a.getAttribute('href').slice(2).split('?')[0]; if (!PE.perm.moduleLabels[mod] || PE.perm.canModule(mod)) return;
      if (a.classList.contains('item')) { a.removeAttribute('href'); a.classList.remove('clickable'); } else a.remove();
    });
  }
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.classList?.contains('overlay')) applyPerms(n); }))).observe(document.body, { childList: true });
  document.addEventListener('change', e => {
    if (e.target.dataset?.actChange !== 'demo-role') return;
    localStorage.setItem('prumo_demo_role', e.target.value); shell(); UI.toast(`Visualizando como ${PE.perm.roles[e.target.value].label}.`);
  });

  /* ---------- CONFIGURAÇÕES ---------- */
  VIEWS.configuracoes = () => {
    const c = S.company, cloud = PE.db.mode === 'cloud';
    return `<div class="page-head"><h1>Configurações</h1></div>
      <div class="grid cols-2"><div class="card stack"><div class="card-title"><h2>Sua empresa</h2></div><form id="co-form" class="stack" novalidate><div class="form-grid">
        <div class="field full"><label>Nome da empresa</label><input class="input" name="name" value="${esc(c.name)}" required></div>
        <div class="field"><label>Seu nome</label><input class="input" name="owner_name" value="${esc(c.owner_name || '')}"></div>
        <div class="field"><label>Tipo de negócio</label><input class="input" name="business_type" value="${esc(c.business_type || '')}"></div>
        <div class="field"><label>Meta de margem (%)</label><input class="input" type="number" step="0.1" name="target_margin" value="${c.target_margin ?? 30}"><span class="hint">Alertas de margem usam esse valor.</span></div>
        <div class="field"><label>Saldo inicial do caixa (R$)</label><input class="input" type="number" step="0.01" name="opening_balance" value="${c.opening_balance ?? 0}"><span class="hint">Quanto havia no caixa antes de usar o Prumo.</span></div></div>
        <button class="btn primary" type="submit">Salvar</button></form></div>
      <div class="stack"><div class="card stack"><div class="card-title"><h2>Plano</h2>${UI.chip(cloud ? 'Teste grátis' : 'Demonstração', 'orange')}</div><div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">${[['Essencial', 'MEIs e negócios muito pequenos'], ['Profissional', 'Negócios em crescimento'], ['Empresa', 'Equipe e operação maior']].map(([n, d], i) => `<div class="card flat" style="padding:12px;${i === 0 ? 'border-color:var(--orange);background:var(--orange-50)' : ''}"><strong>${n}</strong><p class="small muted">${d}</p></div>`).join('')}</div><p class="small muted">Valores e limites ficam na tabela <code>pe_plans</code> e podem ser alterados a qualquer momento.</p></div>
        <div class="card stack"><div class="card-title"><h2>Conta e dados</h2></div><p class="small muted">Conectado como <strong>${esc(PE.db.user?.email || '')}</strong> · ${cloud ? 'Supabase (nuvem)' : 'modo demonstração (dados só neste navegador)'}</p>
          ${cloud ? '' : `<div class="alert info"><span class="dot"></span><div class="a-detail">Para salvar na nuvem: rode <code>supabase/schema.sql</code> no SQL Editor e cole a <em>anon key</em> em <code>js/config.js</code>.</div></div>`}
          <div class="row wrap"><button class="btn ghost" data-act="export-data">Exportar meus dados (LGPD)</button><button class="btn ghost" data-act="load-sample">Carregar dados de exemplo</button>${cloud ? '' : '<button class="btn danger" data-act="reset-demo">Apagar dados de demonstração</button>'}<button class="btn ghost" data-act="logout">Sair</button></div></div>
        <div class="card stack"><div class="card-title"><h2>Equipe</h2></div><p class="small muted">Convide pessoas, defina perfis e metas em <a href="#/equipe"><u>Equipe e permissões</u></a>.</p></div></div></div>`;
  };
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'co-form') return; e.preventDefault(); const f = e.target;
    if (!f.name.value.trim()) return UI.toast('Informe o nome da empresa.', 'err');
    await UI.run(async () => { await PE.db.saveCompany({ name: f.name.value.trim(), owner_name: f.owner_name.value.trim() || null, business_type: f.business_type.value.trim() || null, target_margin: Number(f.target_margin.value) || 30, opening_balance: Number(f.opening_balance.value) || 0 }); refresh(); UI.toast('Configurações salvas.'); }, f.querySelector('[type=submit]'));
  });
  A['export-data'] = () => { const blob = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'meus-dados-prumo.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  A['reset-demo'] = () => UI.confirm('Apagar TODOS os dados de demonstração deste navegador?', async () => { PE.db.resetDemo(); location.hash = ''; location.reload(); }, 'Apagar tudo');

  /* =====================================================================
     INICIALIZAÇÃO
  ===================================================================== */
  async function start() {
    root.innerHTML = '<div class="splash"><div class="spinner"></div></div>';
    try {
      await PE.db.loadAll();
      if (!S.company || !S.company.onboarded) { OB.step = 0; OB.data = { channels: [], name: S.company?.name }; return renderOnboarding(); }
      shell();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="splash"><div class="stack" style="max-width:440px;padding:24px;text-align:center;justify-items:center"><h2>Não foi possível carregar seus dados</h2><p class="muted small">${esc(e.message)}</p><p class="small muted">Se acabou de criar o projeto, confira se o <code>schema.sql</code> foi executado no Supabase.</p><div class="row"><button class="btn primary" onclick="location.reload()">Tentar de novo</button><button class="btn ghost" data-act="logout">Sair</button></div></div></div>`;
    }
  }
  (async function boot() {
    root.innerHTML = '<div class="splash"><div class="spinner"></div></div>';
    try { const user = await PE.db.init(); user ? await start() : renderAuth(); }
    catch (e) { console.error(e); renderAuth(); UI.toast('Falha ao iniciar: ' + e.message, 'err'); }
  })();
})();

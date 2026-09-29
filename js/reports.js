// Relatórios do Prumo: financeiros, comerciais, estoque e marketing.
// Cada relatório devolve { kpis, bars, tables } com os mesmos dados usados na tela e no CSV.
window.PE = window.PE || {};
PE.reports = (function () {
  const U = PE.u, E = () => PE.engine;
  const inR = (d, a, b) => !!d && d >= a && d <= b;
  const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
  const validSales = S => S.sales.filter(s => s.status !== 'cancelada');
  const ratio = (a, b) => (b ? a / b * 100 : 0);

  /** Últimos n meses (do mais antigo ao atual). */
  function months(n) {
    const T = U.today(), y = Number(T.slice(0, 4)), m = Number(T.slice(5, 7)) - 1, out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      out.push({ start: U.iso(d), end: U.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(2) });
    }
    return out;
  }
  const kpi = (label, value, sub, cls) => ({ label, value, sub: sub || '', cls: cls || '' });

  /* ---------------- Financeiros ---------------- */
  function financeiros(S, per) {
    const m = E().metrics(S, per), c = m.cur, ms = months(6), sales = validSales(S), tx = S.transactions, T = U.today();
    const isOp = t => t.kind === 'despesa' && t.category !== 'Compra de mercadoria';
    const rows = ms.map(mo => {
      const sv = sales.filter(s => inR(s.sold_at, mo.start, mo.end));
      const vendas = sum(sv, s => Number(s.total)), cmv = sum(sv, s => Number(s.cost_total));
      const desp = sum(tx.filter(t => isOp(t) && inR(t.paid_date || t.due_date, mo.start, mo.end)), t => Number(t.amount));
      return { mo, vendas, cmv, desp, lucro: vendas - cmv - desp };
    });
    const open = Number(S.company?.opening_balance || 0);
    const cash = ms.map(mo => {
      const inn = sum(tx.filter(t => t.kind === 'receita' && inR(t.paid_date, mo.start, mo.end)), t => Number(t.amount));
      const out = sum(tx.filter(t => t.kind === 'despesa' && inR(t.paid_date, mo.start, mo.end)), t => Number(t.amount));
      const acc = open + sum(tx.filter(t => t.paid_date && t.paid_date <= mo.end), t => (t.kind === 'receita' ? 1 : -1) * Number(t.amount));
      return { mo, inn, out, acc };
    });
    const cats = {};
    tx.filter(t => t.kind === 'despesa' && inR(t.paid_date || t.due_date, per.start, per.end)).forEach(t => { const k = t.category || 'Outros'; cats[k] = (cats[k] || 0) + Number(t.amount); });
    const catTotal = sum(Object.values(cats), v => v);
    const pend = tx.filter(t => !t.paid_date);
    const bucket = (kind, a, b) => sum(pend.filter(t => t.kind === kind && U.daysBetween(T, t.due_date) >= a && U.daysBetween(T, t.due_date) <= b), t => Number(t.amount));
    const ag = [['Vencidas', -99999, -1], ['Vencem em até 7 dias', 0, 7], ['Vencem em 8 a 30 dias', 8, 30], ['Vencem depois de 30 dias', 31, 99999]];
    return {
      kpis: [kpi('Faturamento', U.brl0(c.vendas), '', 'orange'), kpi('Despesas pagas', U.brl0(c.despesas)), kpi('Lucro estimado', U.brl0(c.lucro), '', c.lucro >= 0 ? 'green' : 'red'), kpi('Margem líquida', U.pct(ratio(c.lucro, c.vendas), 0), '', 'black')],
      bars: [{ title: 'Vendas por mês', series: rows.map(r => ({ label: r.mo.label, value: r.vendas })) }, { title: 'Lucro por mês', series: rows.map(r => ({ label: r.mo.label, value: Math.max(0, r.lucro) })) }],
      tables: [
        { title: 'Evolução mensal (últimos 6 meses)', head: ['Mês', 'Vendas', 'Custo dos produtos', 'Despesas', 'Lucro', 'Margem'], num: true, rows: rows.map(r => [r.mo.label, U.brl(r.vendas), U.brl(r.cmv), U.brl(r.desp), U.brl(r.lucro), U.pct(ratio(r.lucro, r.vendas), 0)]) },
        { title: 'Despesas por categoria (período)', head: ['Categoria', 'Valor', '% do total'], num: true, rows: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, U.brl(v), U.pct(ratio(v, catTotal), 0)]) },
        { title: 'Fluxo de caixa mensal', head: ['Mês', 'Entradas', 'Saídas', 'Saldo do mês', 'Saldo acumulado'], num: true, rows: cash.map(r => [r.mo.label, U.brl(r.inn), U.brl(r.out), U.brl(r.inn - r.out), U.brl(r.acc)]) },
        { title: 'Contas a receber e a pagar por vencimento', head: ['Faixa', 'A receber', 'A pagar'], num: true, rows: ag.map(([l, a, b]) => [l, U.brl(bucket('receita', a, b)), U.brl(bucket('despesa', a, b))]) }
      ]
    };
  }

  /* ---------------- Comerciais ---------------- */
  function comerciais(S, per) {
    const sv = validSales(S).filter(s => inR(s.sold_at, per.start, per.end));
    const total = sum(sv, s => Number(s.total)), n = sv.length;
    const buyers = new Set(sv.map(s => s.customer_id).filter(Boolean));
    const novos = S.customers.filter(c => inR((c.created_at || '').slice(0, 10), per.start, per.end)).length;
    const won = S.opportunities.filter(o => ['venda', 'posvenda'].includes(o.stage)).length, lost = S.opportunities.filter(o => o.stage === 'perdido').length;
    const prods = {};
    sv.forEach(s => (s.items || []).forEach(i => { const k = i.product_id || i.name; const p = prods[k] || (prods[k] = { name: i.name, qty: 0, rev: 0, profit: 0 }); p.qty += i.qty; p.rev += i.qty * i.unit_price; p.profit += i.qty * (i.unit_price - i.unit_cost); }));
    const custs = {};
    sv.forEach(s => { if (!s.customer_id) return; const c = custs[s.customer_id] || (custs[s.customer_id] = { name: S.customers.find(x => x.id === s.customer_id)?.name || 'Cliente removido', n: 0, v: 0 }); c.n++; c.v += Number(s.total); });
    const pays = {}; sv.forEach(s => { const k = s.payment_method || 'Não informado'; const p = pays[k] || (pays[k] = { n: 0, v: 0 }); p.n++; p.v += Number(s.total); });
    const sellers = {}; sv.forEach(s => { const m = S.members.find(x => x.user_id === s.created_by); const k = m ? (m.name || m.email) : 'Não identificado'; const p = sellers[k] || (sellers[k] = { n: 0, v: 0 }); p.n++; p.v += Number(s.total); });
    const stages = [['novo', 'Novo lead'], ['contato', 'Contato'], ['negociacao', 'Negociação'], ['proposta', 'Proposta'], ['venda', 'Venda'], ['posvenda', 'Pós-venda'], ['perdido', 'Perdida']];
    const sc = {}; S.customers.forEach(c => { const st = E().customerStats(S, c); const x = sc[st.status] || (sc[st.status] = { n: 0, v: 0 }); x.n++; x.v += st.total; });
    return {
      kpis: [kpi('Vendas', U.brl0(total), '', 'orange'), kpi('Nº de vendas', n), kpi('Ticket médio', U.brl0(n ? total / n : 0)), kpi('Clientes que compraram', buyers.size, `<span class="muted">${novos} novo${novos === 1 ? '' : 's'} cadastrado${novos === 1 ? '' : 's'}</span>`, 'black'), kpi('Conversão de oportunidades', won + lost ? U.pct(ratio(won, won + lost), 0) : '—', `<span class="muted">${won} ganha${won === 1 ? '' : 's'} · ${lost} perdida${lost === 1 ? '' : 's'}</span>`, 'green')],
      bars: [{ title: 'Vendas no período', series: E().salesSeries(S, per) }],
      tables: [
        { title: 'Produtos mais vendidos', head: ['Produto', 'Qtde', 'Receita', 'Lucro bruto', 'Margem'], num: true, rows: Object.values(prods).sort((a, b) => b.rev - a.rev).slice(0, 10).map(p => [p.name, String(p.qty), U.brl(p.rev), U.brl(p.profit), U.pct(ratio(p.profit, p.rev), 0)]) },
        { title: 'Melhores clientes', head: ['Cliente', 'Compras', 'Valor', 'Ticket médio'], num: true, rows: Object.values(custs).sort((a, b) => b.v - a.v).slice(0, 10).map(c => [c.name, String(c.n), U.brl(c.v), U.brl(c.v / c.n)]) },
        { title: 'Formas de pagamento', head: ['Forma', 'Vendas', 'Valor', '% do total'], num: true, rows: Object.entries(pays).sort((a, b) => b[1].v - a[1].v).map(([k, p]) => [k, String(p.n), U.brl(p.v), U.pct(ratio(p.v, total), 0)]) },
        ...(S.members.length > 1 || Object.keys(sellers).some(k => k !== 'Não identificado') ? [{ title: 'Vendas por vendedor', head: ['Vendedor', 'Vendas', 'Valor', 'Ticket médio'], num: true, rows: Object.entries(sellers).sort((a, b) => b[1].v - a[1].v).map(([k, p]) => [k, String(p.n), U.brl(p.v), U.brl(p.v / p.n)]) }] : []),
        { title: 'Funil de oportunidades', head: ['Etapa', 'Oportunidades', 'Valor'], num: true, rows: stages.map(([k, l]) => { const l2 = S.opportunities.filter(o => o.stage === k); return [l, String(l2.length), U.brl(sum(l2, o => Number(o.value)))]; }) },
        { title: 'Clientes por situação', head: ['Situação', 'Clientes', 'Total já comprado'], num: true, rows: Object.entries(sc).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => [E().statusMeta[k].label, String(x.n), U.brl(x.v)]) }
      ]
    };
  }

  /* ---------------- Estoque ---------------- */
  function estoque(S) {
    const list = S.products.filter(p => p.active !== false && !p.is_service).map(p => ({ p, st: E().productStats(S, p) }));
    const low = list.filter(x => Number(x.p.min_stock) > 0 && Number(x.p.stock) <= Number(x.p.min_stock)), idle = list.filter(x => x.st.idle);
    const value = sum(list, x => x.st.stockValue), idleVal = sum(idle, x => x.st.stockValue);
    const cover = x => (x.st.q30 > 0 ? Number(x.p.stock) / (x.st.q30 / 30) : x.st.q90 > 0 ? Number(x.p.stock) / (x.st.q90 / 90) : null);
    const state = x => (Number(x.p.min_stock) > 0 && Number(x.p.stock) <= Number(x.p.min_stock) ? 'Repor' : x.st.idle ? 'Parado' : x.st.daysLeft !== null && x.st.daysLeft <= 7 ? 'Acaba em breve' : 'OK');
    const byCover = [...list].sort((a, b) => (cover(a) ?? 1e9) - (cover(b) ?? 1e9));
    const mv = [...S.stock_movements].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 20);
    return {
      kpis: [kpi('Valor em estoque (custo)', U.brl0(value), '', 'orange'), kpi('Produtos ativos', list.length), kpi('Abaixo do mínimo', low.length, '', low.length ? 'red' : 'green'), kpi('Parados há 90+ dias', idle.length, `<span class="muted">${U.brl0(idleVal)} parados</span>`, 'black')],
      bars: [],
      tables: [
        { title: 'Giro e cobertura do estoque', head: ['Produto', 'Estoque', 'Mínimo', 'Vendido 30d', 'Vendido 90d', 'Cobertura', 'Situação'], num: true, rows: byCover.map(x => { const c = cover(x); return [x.p.name, String(Number(x.p.stock)), String(Number(x.p.min_stock)), String(x.st.q30), String(x.st.q90), c === null ? '—' : `${Math.round(c)} dias`, state(x)]; }) },
        { title: 'Produtos parados', head: ['Produto', 'Estoque', 'Valor parado (custo)', 'Última venda'], num: true, rows: idle.sort((a, b) => b.st.stockValue - a.st.stockValue).map(x => [x.p.name, String(Number(x.p.stock)), U.brl(x.st.stockValue), x.st.lastSale ? U.fmtDate(x.st.lastSale) : 'Nunca vendeu']) },
        { title: 'Movimentações recentes', head: ['Data', 'Produto', 'Tipo', 'Qtde', 'Motivo'], rows: mv.map(m => [U.fmtDate((m.created_at || '').slice(0, 10)), S.products.find(p => p.id === m.product_id)?.name || 'Produto removido', m.kind, String(Number(m.quantity)), m.reason || '—']) }
      ]
    };
  }

  /* ---------------- Marketing ---------------- */
  function marketing(S, per) {
    const camps = S.campaigns.map(c => ({ c, r: E().mk.results(S, c), size: E().mk.audience(S, c.audience).length }));
    const sent = sum(camps, x => x.r.sent), conv = sum(camps, x => x.r.converted), val = sum(camps, x => x.r.convValue);
    const leads = S.opportunities.filter(o => inR((o.created_at || '').slice(0, 10), per.start, per.end)).length + S.customers.filter(c => inR((c.created_at || '').slice(0, 10), per.start, per.end) && !E().customerStats(S, c).count).length;
    const wa = E().waStats(S);
    const origins = {}; S.customers.forEach(c => { const k = c.origin || 'Não informada'; const st = E().customerStats(S, c); const o = origins[k] || (origins[k] = { n: 0, buyers: 0, v: 0 }); o.n++; if (st.count) o.buyers++; o.v += st.total; });
    const autos = S.automations.map(a => [a.name, a.active ? 'Ativa' : 'Pausada', String(PE.auto ? PE.auto.runs(S, a.id, 30).length : 0)]);
    return {
      kpis: [kpi('Campanhas', S.campaigns.length, `<span class="muted">${S.campaigns.filter(c => c.status === 'ativa').length} ativa(s)</span>`, 'orange'), kpi('Contatos enviados', sent), kpi('Clientes que compraram', conv, `<span class="muted">conversão ${sent ? U.pct(ratio(conv, sent), 0) : '—'}</span>`, 'green'), kpi('Vendas após contato', U.brl0(val), '', 'black'), kpi('Novos leads no período', leads)],
      bars: [],
      tables: [
        { title: 'Desempenho das campanhas', head: ['Campanha', 'Público', 'Enviados', 'Compraram', 'Conversão', 'Vendas após contato', 'Vendas do produto'], num: true, rows: camps.sort((a, b) => b.r.convValue - a.r.convValue).map(x => [x.c.name, `${E().mk.audienceLabel(S, x.c.audience)} (${x.size})`, String(x.r.sent), String(x.r.converted), x.r.sent ? U.pct(ratio(x.r.converted, x.r.sent), 0) : '—', U.brl(x.r.convValue), U.brl(x.r.prodRev)]) },
        { title: 'Recuperação de clientes por WhatsApp', head: ['Indicador', 'Valor'], num: true, rows: [['Lembretes enviados (30 dias)', String(wa.sent30)], ['Clientes sumidos que voltaram', String(wa.back)], ['Vendas recuperadas', U.brl(wa.value)]] },
        { title: 'Origem dos clientes', head: ['Origem', 'Clientes', 'Já compraram', 'Total comprado'], num: true, rows: Object.entries(origins).sort((a, b) => b[1].v - a[1].v).map(([k, o]) => [k, String(o.n), String(o.buyers), U.brl(o.v)]) },
        ...(autos.length ? [{ title: 'Automações (30 dias)', head: ['Automação', 'Situação', 'Execuções'], num: true, rows: autos }] : [])
      ]
    };
  }

  const strip = h => String(h).replace(/<[^>]+>/g, '');
  return {
    sections: { financeiros: 'Financeiros', comerciais: 'Comerciais', estoque: 'Estoque', marketing: 'Marketing' },
    build(S, tab, per) { return { financeiros, comerciais, estoque, marketing }[tab](S, per); },
    /** CSV com ponto e vírgula e BOM: abre direto no Excel em português. */
    toCsv(rep, title, per) {
      const q = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const line = a => a.map(q).join(';');
      const out = [line(['Relatório', title]), line(['Período', `${U.fmtDate(per.start)} a ${U.fmtDate(per.end)}`]), '', line(['Indicador', 'Valor', 'Observação'])];
      rep.kpis.forEach(k => out.push(line([k.label, strip(k.value), strip(k.sub)])));
      rep.tables.forEach(t => { out.push('', line([t.title]), line(t.head)); t.rows.forEach(r => out.push(line(r))); });
      return '﻿' + out.join('\r\n');
    }
  };
})();

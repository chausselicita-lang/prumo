// Motor do Prumo: métricas, classificação, alertas, precificação e Consultor.
window.PE = window.PE || {};
const U = PE.u;

PE.engine = {
  /* ---------- Períodos ---------- */
  period(range, custom) {
    const T = U.today(); const d = new Date(T + 'T12:00:00');
    let start, end = T;
    if (range === 'hoje') start = T;
    else if (range === 'semana') { const w = d.getDay(); start = U.addDays(T, -((w + 6) % 7)); }
    else if (range === 'mes') start = T.slice(0, 8) + '01';
    else if (range === 'trimestre') { const q = Math.floor(d.getMonth() / 3) * 3; start = U.iso(new Date(d.getFullYear(), q, 1)); }
    else if (range === 'ano') start = d.getFullYear() + '-01-01';
    else if (range === 'custom' && custom?.start) { start = custom.start; end = custom.end || T; }
    else start = T.slice(0, 8) + '01';
    const len = U.daysBetween(start, end) + 1;
    return { start, end, prevStart: U.addDays(start, -len), prevEnd: U.addDays(start, -1), len };
  },
  inRange(date, a, b) { return !!date && date >= a && date <= b; },

  /* ---------- Métricas do período ---------- */
  metrics(S, per) {
    const sales = S.sales.filter(s => s.status !== 'cancelada');
    const calc = (a, b) => {
      const sv = sales.filter(s => this.inRange(s.sold_at, a, b));
      const vendas = sv.reduce((t, s) => t + Number(s.total), 0);
      const cmv = sv.reduce((t, s) => t + Number(s.cost_total), 0);
      const tx = S.transactions;
      const receitas = tx.filter(t => t.kind === 'receita' && this.inRange(t.paid_date, a, b)).reduce((s, t) => s + Number(t.amount), 0);
      const despesas = tx.filter(t => t.kind === 'despesa' && this.inRange(t.paid_date, a, b)).reduce((s, t) => s + Number(t.amount), 0);
      // Despesas operacionais (exclui compra de mercadoria: já entra como custo da venda)
      const despOp = tx.filter(t => t.kind === 'despesa' && t.category !== 'Compra de mercadoria' && this.inRange(t.paid_date || t.due_date, a, b)).reduce((s, t) => s + Number(t.amount), 0);
      const lucro = vendas - cmv - despOp;
      return { vendas, receitas, despesas, lucro, cmv, despOp, qtd: sv.length, ticket: sv.length ? vendas / sv.length : 0, margem: vendas ? (vendas - cmv) / vendas * 100 : 0 };
    };
    const cur = calc(per.start, per.end), prev = calc(per.prevStart, per.prevEnd);
    return { cur, prev, caixa: this.cash(S), delta: (k) => prev[k] ? (cur[k] - prev[k]) / Math.abs(prev[k]) * 100 : null };
  },

  cash(S) {
    const open = Number(S.company?.opening_balance || 0);
    return open + S.transactions.filter(t => t.paid_date).reduce((s, t) => s + (t.kind === 'receita' ? 1 : -1) * Number(t.amount), 0);
  },

  /** Projeção de caixa dia a dia a partir do saldo atual e contas pendentes. */
  cashProjection(S, days = 45) {
    const T = U.today(); let bal = this.cash(S); const out = []; let firstNegative = null;
    const pend = S.transactions.filter(t => !t.paid_date);
    for (let i = 0; i <= days; i++) {
      const day = U.addDays(T, i);
      pend.filter(t => (i === 0 ? t.due_date <= day : t.due_date === day)).forEach(t => { bal += (t.kind === 'receita' ? 1 : -1) * Number(t.amount); });
      out.push({ day, bal });
      if (bal < 0 && !firstNegative) firstNegative = { day, offset: i, bal };
    }
    return { series: out, firstNegative, end: bal };
  },

  /** Vendas agrupadas para o gráfico. */
  salesSeries(S, per) {
    const map = {}; const days = per.len;
    const bucket = days > 62 ? 'mes' : days > 20 ? 'semana' : 'dia';
    S.sales.filter(s => s.status !== 'cancelada' && this.inRange(s.sold_at, per.start, per.end)).forEach(s => {
      let k = s.sold_at;
      if (bucket === 'mes') k = s.sold_at.slice(0, 7);
      if (bucket === 'semana') { const w = Math.floor(U.daysBetween(per.start, s.sold_at) / 7); k = U.addDays(per.start, w * 7); }
      map[k] = (map[k] || 0) + Number(s.total);
    });
    const keys = [];
    if (bucket === 'dia') for (let i = 0; i < days; i++) keys.push(U.addDays(per.start, i));
    else if (bucket === 'semana') for (let i = 0; i * 7 < days; i++) keys.push(U.addDays(per.start, i * 7));
    else { const set = new Set(); for (let i = 0; i < days; i += 15) set.add(U.addDays(per.start, i).slice(0, 7)); set.add(per.end.slice(0, 7)); keys.push(...[...set].sort()); }
    return keys.map(k => ({ key: k, label: bucket === 'mes' ? k.slice(5) + '/' + k.slice(2, 4) : U.fmtShort(k), value: map[k] || 0 }));
  },

  /* ---------- Clientes ---------- */
  customerStats(S, c) {
    const sales = S.sales.filter(s => s.customer_id === c.id && s.status !== 'cancelada').sort((a, b) => b.sold_at.localeCompare(a.sold_at));
    const total = sales.reduce((t, s) => t + Number(s.total), 0);
    const last = sales[0]?.sold_at || null; const T = U.today();
    const since = last ? U.daysBetween(last, T) : null;
    const hasOpp = S.opportunities.some(o => o.customer_id === c.id && !['venda', 'posvenda', 'perdido'].includes(o.stage));
    let status;
    if (!sales.length) status = hasOpp ? 'potencial' : 'potencial';
    else if (since > 180) status = 'perdido';
    else if (since > 90) status = 'inativo';
    else if (total >= 1500 || sales.length >= 5) status = 'vip';
    else if (sales.length >= 2) status = 'recorrente';
    else status = 'novo';
    const products = {};
    sales.forEach(s => (s.items || []).forEach(i => { products[i.name] = (products[i.name] || 0) + i.qty; }));
    const freq = sales.length > 1 ? Math.round(U.daysBetween(sales[sales.length - 1].sold_at, last) / (sales.length - 1)) : null;
    return { sales, count: sales.length, total, last, since, ticket: sales.length ? total / sales.length : 0, status, products, freq };
  },
  statusMeta: {
    novo: { label: 'Novo', cls: 'blue' }, recorrente: { label: 'Recorrente', cls: 'green' }, vip: { label: 'VIP', cls: 'orange' },
    inativo: { label: 'Inativo', cls: 'yellow' }, potencial: { label: 'Potencial', cls: '' }, perdido: { label: 'Perdido', cls: 'red' }
  },

  /* ---------- Produtos ---------- */
  productStats(S, p) {
    const price = Number(p.price), cost = Number(p.cost), fee = price * Number(p.fee_pct || 0) / 100;
    const profit = price - cost - fee; const margin = price ? profit / price * 100 : 0;
    const T = U.today();
    const sold = (a, b) => S.sales.filter(s => s.status !== 'cancelada' && this.inRange(s.sold_at, a, b))
      .reduce((t, s) => t + (s.items || []).filter(i => i.product_id === p.id).reduce((q, i) => q + i.qty, 0), 0);
    const q30 = sold(U.addDays(T, -30), T), q30prev = sold(U.addDays(T, -60), U.addDays(T, -31)), q90 = sold(U.addDays(T, -90), T);
    const lastSale = S.sales.filter(s => s.status !== 'cancelada' && (s.items || []).some(i => i.product_id === p.id)).map(s => s.sold_at).sort().pop() || null;
    const ageDays = p.created_at ? U.daysBetween(p.created_at.slice(0, 10), T) : 999;
    const idle = !p.is_service && Number(p.stock) > 0 && q90 === 0 && (lastSale ? U.daysBetween(lastSale, T) > 90 : ageDays > 90);
    const perDay = q30 / 30;
    const daysLeft = !p.is_service && perDay > 0 ? Math.floor(Number(p.stock) / perDay) : null;
    return { profit, margin, q30, q30prev, q90, lastSale, idle, daysLeft, stockValue: Number(p.stock) * cost, totalProfit30: q30 * profit };
  },

  /* ---------- Alertas (central ATENÇÃO) ---------- */
  alerts(S) {
    const out = []; const T = U.today();
    const push = (level, key, title, detail, route, cta) => out.push({ level, key, title, detail, route, cta });
    const target = Number(S.company?.target_margin || 30);
    const dismissed = new Set(S.notifications.filter(n => n.dismissed_until && n.dismissed_until >= T).map(n => n.alert_key));

    // Financeiro
    const pend = S.transactions.filter(t => !t.paid_date);
    const overdue = pend.filter(t => t.kind === 'despesa' && t.due_date < T);
    const soon = pend.filter(t => t.kind === 'despesa' && t.due_date >= T && t.due_date <= U.addDays(T, 3));
    if (overdue.length) push('urgent', 'overdue', `${overdue.length} ${overdue.length > 1 ? 'contas vencidas' : 'conta vencida'}`, `Total de ${U.brl(overdue.reduce((s, t) => s + Number(t.amount), 0))} em atraso. Pague ou renegocie.`, 'financeiro', 'Ver contas');
    if (soon.length) push('urgent', 'due-soon', `${soon.length} ${soon.length > 1 ? 'contas vencendo' : 'conta vencendo'} nos próximos 3 dias`, `${U.brl(soon.reduce((s, t) => s + Number(t.amount), 0))} a pagar em breve.`, 'financeiro', 'Ver contas');
    const lateReceb = pend.filter(t => t.kind === 'receita' && t.due_date < T);
    if (lateReceb.length) push('attention', 'late-receivable', `${lateReceb.length} ${lateReceb.length > 1 ? 'recebimentos atrasados' : 'recebimento atrasado'}`, `${U.brl(lateReceb.reduce((s, t) => s + Number(t.amount), 0))} para cobrar de clientes.`, 'financeiro', 'Cobrar');
    if (S.transactions.length) {
      const pr = this.cashProjection(S, 45);
      if (this.cash(S) < 0) push('urgent', 'cash-neg', 'Caixa negativo agora', `Seu saldo está em ${U.brl(this.cash(S))}. Priorize recebimentos.`, 'financeiro', 'Ver fluxo de caixa');
      else if (pr.firstNegative) push('urgent', 'cash-proj', `Caixa projetado negativo em ${pr.firstNegative.offset} dia${pr.firstNegative.offset === 1 ? '' : 's'}`, `Com as contas já cadastradas, o saldo chega a ${U.brl(pr.firstNegative.bal)} em ${U.fmtDate(pr.firstNegative.day)}.`, 'financeiro', 'Ver previsão');
    }

    // Vendas: queda
    const per = this.period('mes'); const m = this.metrics(S, per);
    const dd = m.delta('vendas');
    if (dd !== null && dd <= -15 && m.prev.vendas > 0) {
      const partial = U.daysBetween(per.start, per.end) + 1;
      if (partial >= 10) push('attention', 'sales-drop', `Vendas ${U.pct(Math.abs(dd), 0)} abaixo do período anterior`, `${U.brl(m.cur.vendas)} agora contra ${U.brl(m.prev.vendas)} antes.`, 'consultor', 'Perguntar ao Consultor');
    }

    // Clientes
    const cs = S.customers.map(c => ({ c, st: this.customerStats(S, c) }));
    const inactive = cs.filter(x => x.st.count > 0 && x.st.since > 90);
    if (inactive.length) push('attention', 'inactive-customers', `${inactive.length} ${inactive.length > 1 ? 'clientes não compram' : 'cliente não compra'} há mais de 90 dias`, `Uma mensagem de retorno pode recuperar vendas. Maior histórico: ${inactive.sort((a, b) => b.st.total - a.st.total)[0].c.name}.`, 'clientes', 'Ver clientes');
    const bday = S.customers.filter(c => c.birthday && (() => { const md = c.birthday.slice(5); for (let i = 0; i <= 7; i++) if (U.addDays(T, i).slice(5) === md) return true; return false; })());
    if (bday.length) push('opportunity', 'birthdays', `${bday.length} ${bday.length > 1 ? 'clientes fazem' : 'cliente faz'} aniversário esta semana`, bday.map(c => c.name).join(', ') + '. Boa hora para uma oferta especial.', 'clientes', 'Ver clientes');
    const stuck = S.opportunities.filter(o => o.stage === 'proposta' && U.daysBetween((o.updated_at || o.created_at).slice(0, 10), T) >= 3);
    if (stuck.length) push('attention', 'stuck-proposals', `${stuck.length} ${stuck.length > 1 ? 'propostas sem resposta' : 'proposta sem resposta'} há 3 dias ou mais`, stuck.map(o => o.title).join(', ') + '. Faça um follow-up.', 'clientes', 'Fazer follow-up');
    const dueActions = S.opportunities.filter(o => o.next_action && o.next_action_date && o.next_action_date <= T && !['venda', 'posvenda', 'perdido'].includes(o.stage));
    if (dueActions.length) push('attention', 'opp-actions', `${dueActions.length} ${dueActions.length > 1 ? 'ações de venda' : 'ação de venda'} para hoje`, dueActions.map(o => o.next_action).slice(0, 3).join(' · '), 'clientes', 'Ver oportunidades');

    // Produtos
    const ps = S.products.filter(p => p.active !== false).map(p => ({ p, st: this.productStats(S, p) }));
    const lowMargin = ps.filter(x => Number(x.p.price) > 0 && x.st.margin < target);
    if (lowMargin.length) push('attention', 'low-margin', `${lowMargin.length} ${lowMargin.length > 1 ? 'produtos com margem' : 'produto com margem'} abaixo da meta de ${U.pct(target, 0)}`, lowMargin.slice(0, 3).map(x => `${x.p.name} (${U.pct(x.st.margin, 0)})`).join(', ') + '.', 'produtos', 'Rever preços');
    const low = ps.filter(x => !x.p.is_service && Number(x.p.stock) <= Number(x.p.min_stock) && Number(x.p.min_stock) > 0);
    if (low.length) push('attention', 'low-stock', `${low.length} ${low.length > 1 ? 'produtos com estoque baixo' : 'produto com estoque baixo'}`, low.slice(0, 3).map(x => `${x.p.name} (${x.p.stock} un.)`).join(', ') + '.', 'produtos', 'Ver produtos');
    ps.filter(x => x.st.daysLeft !== null && x.st.daysLeft <= 7 && Number(x.p.stock) > Number(x.p.min_stock)).forEach(x =>
      push('attention', 'runout-' + x.p.id, `Estoque de ${x.p.name} deve acabar em ${x.st.daysLeft} dia${x.st.daysLeft === 1 ? '' : 's'}`, `Pelo ritmo dos últimos 30 dias, restam ${x.p.stock} unidades.`, 'produtos', 'Repor'));
    const idle = ps.filter(x => x.st.idle);
    if (idle.length) push('info', 'idle-products', `${U.brl0(idle.reduce((s, x) => s + x.st.stockValue, 0))} em produtos sem venda há mais de 90 dias`, idle.slice(0, 4).map(x => x.p.name).join(', ') + '. Considere uma promoção para girar esse estoque.', 'produtos', 'Ver parados');
    ps.filter(x => x.st.q30prev >= 2 && x.st.q30 > x.st.q30prev * 1.2).slice(0, 2).forEach(x =>
      push('opportunity', 'hot-' + x.p.id, `${x.p.name} aumentou as vendas em ${U.pct((x.st.q30 / x.st.q30prev - 1) * 100, 0)}`, 'Vale destacar esse produto e garantir estoque.', 'produtos', 'Ver produto'));

    // Tarefas
    const lateTasks = S.tasks.filter(t => t.status !== 'concluida' && t.due_date && t.due_date < T);
    if (lateTasks.length) push('attention', 'late-tasks', `${lateTasks.length} ${lateTasks.length > 1 ? 'tarefas atrasadas' : 'tarefa atrasada'}`, lateTasks.slice(0, 3).map(t => t.title).join(' · '), 'tarefas', 'Ver tarefas');

    const order = { urgent: 0, attention: 1, opportunity: 2, info: 3 };
    return out.filter(a => !dismissed.has(a.key)).sort((a, b) => order[a.level] - order[b.level]);
  },
  levelMeta: { urgent: { label: 'Urgente', emoji: '🔴' }, attention: { label: 'Atenção', emoji: '🟡' }, info: { label: 'Informação', emoji: '🔵' }, opportunity: { label: 'Oportunidade', emoji: '🟢' } },

  /* ---------- Precificação ---------- */
  pricing({ cost, tax, commission, card, freight, expenses, margin }) {
    const varPct = (tax + commission + card) / 100;
    const fixed = cost + freight + expenses;
    const build = (mPct) => { const den = 1 - varPct - mPct / 100; return den > 0 ? fixed / den : null; };
    const min = build(0), rec = build(margin), promo = build(margin / 2);
    const resulting = (price) => {
      if (!price) return { profit: 0, margin: 0 };
      const profit = price - price * varPct - fixed; return { profit, margin: profit / price * 100 };
    };
    return { min, rec, promo, resulting, viable: rec !== null };
  },

  /* ---------- Consultor ---------- */
  suggestions: ['Por que meu lucro caiu?', 'Quais produtos estão dando mais lucro?', 'Quais clientes devo procurar?', 'Posso dar 15% de desconto?', 'Quanto preciso vender este mês?', 'Meu caixa está saudável?', 'O que está consumindo minha margem?', 'Quais produtos devo repor?'],

  ask(S, q) {
    const t = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!S.sales.length && !S.products.length && !S.customers.length)
      return { dado: 'Ainda não há dados suficientes cadastrados.', causa: 'Sem vendas, produtos ou clientes eu não consigo analisar o seu negócio.', impacto: 'As respostas ficariam genéricas — e você merece números reais.', acao: 'Cadastre seus produtos e registre as primeiras vendas. Na tela Início você pode carregar dados de exemplo para ver o Consultor em ação.' };
    if (/desconto|promo/.test(t)) return this.qDiscount(S, q);
    if (/lucro.*(caiu|cair|diminu|menor|baixo)|por que.*lucro|caiu.*lucro/.test(t)) return this.qProfitDrop(S);
    if (/(mais|maior).*(lucro|lucrativ)|dando lucro|melhores produtos/.test(t)) return this.qTopProducts(S);
    if (/cliente.*(procurar|contatar|chamar|recuper)|quais clientes|sumid/.test(t)) return this.qCustomers(S);
    if (/quanto.*(preciso|devo|tenho que).*vend|meta|ponto de equilibrio/.test(t)) return this.qBreakeven(S);
    if (/caixa|saudavel|dinheiro/.test(t)) return this.qCash(S);
    if (/margem|consumindo|custo/.test(t)) return this.qMargin(S);
    if (/repor|reposicao|estoque|comprar/.test(t)) return this.qRestock(S);
    if (/parado|encalhad/.test(t)) return this.qIdle(S);
    return { dado: 'Não entendi essa pergunta com precisão.', causa: 'Eu respondo usando os números do seu negócio: lucro, caixa, margem, clientes, estoque e metas.', impacto: 'Perguntas mais diretas geram respostas mais úteis.', acao: 'Tente uma das sugestões abaixo, por exemplo "Meu caixa está saudável?" ou "Quais clientes devo procurar?".' };
  },

  qProfitDrop(S) {
    const per = this.period('mes'); const m = this.metrics(S, per); const c = m.cur, p = m.prev;
    const dv = m.delta('vendas'), dl = m.delta('lucro');
    if (!p.vendas) return { dado: `No período atual você vendeu ${U.brl(c.vendas)} e teve lucro estimado de ${U.brl(c.lucro)}.`, causa: 'Ainda não existe um período anterior com vendas para comparar.', impacto: 'Sem comparação não dá para saber se o lucro subiu ou caiu.', acao: 'Continue registrando vendas e despesas; em poucas semanas a comparação fica disponível.' };
    const caiu = c.lucro < p.lucro;
    const partes = [];
    if (c.margem < p.margem - 1) partes.push(`a margem média caiu de ${U.pct(p.margem, 0)} para ${U.pct(c.margem, 0)}`);
    if (c.despOp > p.despOp * 1.1 && p.despOp > 0) partes.push(`as despesas subiram ${U.pct((c.despOp / p.despOp - 1) * 100, 0)} (${U.brl(p.despOp)} → ${U.brl(c.despOp)})`);
    if (dv !== null && dv < -5) partes.push(`as vendas recuaram ${U.pct(Math.abs(dv), 0)}`);
    const dado = `Suas vendas ${dv >= 0 ? 'subiram' : 'caíram'} ${U.pct(Math.abs(dv || 0), 0)}, e o lucro estimado ${caiu ? 'caiu' : 'subiu'} ${dl === null ? '' : U.pct(Math.abs(dl), 0)} (${U.brl(p.lucro)} → ${U.brl(c.lucro)}).`;
    const causa = partes.length ? `Os dados indicam que ${partes.join(' e ')}.` : caiu ? 'Não há um único vilão claro; o resultado é uma combinação de pequenos movimentos entre custo, despesa e volume.' : 'O lucro não caiu no período — está estável ou melhor.';
    return { dado, causa, impacto: caiu ? `Cada R$ 100 vendidos estão deixando menos dinheiro no seu bolso. Diferença no período: ${U.brl(c.lucro - p.lucro)}.` : 'Seu negócio está convertendo vendas em resultado de forma saudável.', acao: caiu ? (c.margem < p.margem - 1 ? 'Revise os preços dos produtos com margem baixa (tela Produtos) e evite descontos sem necessidade.' : 'Revise as despesas do período na tela Financeiro e corte o que não gera venda.') : 'Mantenha o ritmo e proteja a margem nos produtos mais vendidos.' };
  },

  qTopProducts(S) {
    const rows = S.products.map(p => ({ p, st: this.productStats(S, p) })).filter(x => x.st.q90 > 0);
    if (!rows.length) return { dado: 'Nenhum produto teve venda registrada nos últimos 90 dias.', causa: 'Sem vendas ligadas a produtos, não dá para medir lucro por produto.', impacto: 'Você pode estar priorizando o produto errado.', acao: 'Ao registrar vendas, selecione o produto cadastrado para o sistema calcular o lucro de cada um.' };
    const tot = rows.map(x => ({ ...x, lucro90: x.st.q90 * x.st.profit })).sort((a, b) => b.lucro90 - a.lucro90);
    const all = tot.reduce((s, x) => s + x.lucro90, 0); const top = tot.slice(0, 3);
    return { dado: `Nos últimos 90 dias: ${top.map(x => `${x.p.name} (${U.brl0(x.lucro90)})`).join(', ')}.`, causa: `Esses ${top.length} produtos respondem por ${U.pct(top.reduce((s, x) => s + x.lucro90, 0) / (all || 1) * 100, 0)} do lucro bruto dos produtos vendidos. Margem do líder: ${U.pct(top[0].st.margin, 0)}.`, impacto: 'Concentrar esforço nos produtos que mais dão lucro rende mais que vender mais de tudo.', acao: `Dê destaque a ${top[0].p.name} nas suas divulgações e mantenha estoque sempre acima do mínimo${tot.length > 3 ? `. Já ${tot[tot.length - 1].p.name} rende pouco (${U.brl0(tot[tot.length - 1].lucro90)}): reveja preço ou pare de repor.` : '.'}` };
  },

  qCustomers(S) {
    const cs = S.customers.map(c => ({ c, st: this.customerStats(S, c) }));
    const back = cs.filter(x => x.st.count > 0 && x.st.since > 60).sort((a, b) => b.st.total - a.st.total).slice(0, 5);
    const leads = S.opportunities.filter(o => !['venda', 'posvenda', 'perdido'].includes(o.stage)).sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 3);
    if (!back.length && !leads.length) return { dado: 'Nenhum cliente sumido e nenhuma oportunidade aberta no momento.', causa: 'Seus clientes estão comprando com regularidade.', impacto: 'Ótimo sinal de fidelização.', acao: 'Aproveite para pedir avaliações e indicações aos clientes mais fiéis.' };
    return { dado: back.length ? `Clientes com maior histórico que estão sumidos: ${back.map(x => `${x.c.name} (${U.brl0(x.st.total)}, sem comprar há ${x.st.since} dias)`).join('; ')}.` : 'Nenhum cliente com histórico está sumido.', causa: 'Clientes que já compraram têm muito mais chance de comprar de novo do que um contato novo.', impacto: `Recuperar esses clientes pode trazer cerca de ${U.brl0(back.reduce((s, x) => s + x.st.ticket, 0))} (um ticket médio de cada).${leads.length ? ` Além disso há ${leads.length} oportunidade(s) abertas, somando ${U.brl0(leads.reduce((s, o) => s + Number(o.value), 0))}.` : ''}`, acao: `Chame no WhatsApp ainda hoje${back[0] ? `, começando por ${back[0].c.name}` : ''}. Ofereça algo relacionado ao que a pessoa já comprou.${leads.length ? ' Depois faça follow-up das propostas em aberto.' : ''}` };
  },

  qDiscount(S, q) {
    const m = q.match(/(\d+(?:[.,]\d+)?)\s*%/); const d = m ? U.num(m[1]) : 10;
    const ps = S.products.filter(p => Number(p.price) > 0 && p.active !== false);
    if (!ps.length) return { dado: 'Você ainda não tem produtos cadastrados.', causa: 'Preciso do custo e do preço para simular o desconto.', impacto: 'Sem essa conta, um desconto pode virar prejuízo.', acao: 'Cadastre seus produtos com custo e preço.' };
    const sim = ps.map(p => { const price = Number(p.price) * (1 - d / 100); const profit = price - Number(p.cost) - price * Number(p.fee_pct || 0) / 100; return { p, profit, margin: profit / price * 100, before: this.productStats(S, p).margin }; });
    const bad = sim.filter(x => x.profit <= 0), thin = sim.filter(x => x.profit > 0 && x.margin < 10);
    const avgB = sim.reduce((s, x) => s + x.before, 0) / sim.length, avgA = sim.reduce((s, x) => s + x.margin, 0) / sim.length;
    const ok = !bad.length && !thin.length;
    const breakEvenVol = avgB > 0 && avgA > 0 ? (avgB / avgA - 1) * 100 : null;
    return { dado: `Com ${U.pct(d, 0)} de desconto, sua margem média cai de ${U.pct(avgB, 0)} para ${U.pct(avgA, 0)}.${bad.length ? ` ${bad.length} produto(s) passam a dar prejuízo: ${bad.slice(0, 3).map(x => x.p.name).join(', ')}.` : ''}${thin.length ? ` ${thin.length} ficam com margem menor que 10%: ${thin.slice(0, 3).map(x => x.p.name).join(', ')}.` : ''}`, causa: 'O desconto sai direto da sua margem; custo e taxas continuam iguais.', impacto: breakEvenVol ? `Para ganhar o mesmo lucro de antes, você precisaria vender cerca de ${U.pct(breakEvenVol, 0)} a mais em volume.` : 'Nesse nível o desconto elimina o lucro médio.', acao: ok ? `Sim, é possível — mas limite a promoção a um período curto e aos produtos com margem folgada. Use a Precificação para simular produto a produto.` : `Não aplique em tudo. Exclua os produtos citados e aplique apenas nos de margem alta ou nos parados. Teste um desconto menor na tela Precificação.` };
  },

  qBreakeven(S) {
    const per = this.period('mes'); const m = this.metrics(S, per);
    const T = U.today(); const fixedTx = S.transactions.filter(t => t.kind === 'despesa' && t.category !== 'Compra de mercadoria' && t.due_date >= U.addDays(T, -30));
    const fixas = fixedTx.reduce((s, t) => s + Number(t.amount), 0);
    const cm = m.cur.vendas ? m.cur.margem : (m.prev.vendas ? m.prev.margem : 0);
    if (!fixas || !cm) return { dado: 'Faltam despesas ou vendas para calcular o ponto de equilíbrio.', causa: 'A conta usa despesas do mês e a margem média das vendas.', impacto: 'Sem ela, você não sabe quanto precisa vender para não ter prejuízo.', acao: 'Lance suas despesas fixas (aluguel, contas, etc.) no Financeiro e registre vendas com produtos cadastrados.' };
    const eq = fixas / (cm / 100); const falta = Math.max(0, eq - m.cur.vendas); const dias = Math.max(1, new Date(new Date(T).getFullYear(), new Date(T).getMonth() + 1, 0).getDate() - new Date(T + 'T12:00:00').getDate() + 1);
    return { dado: `Suas despesas do mês somam ${U.brl0(fixas)} e a margem média é ${U.pct(cm, 0)}. Ponto de equilíbrio: ${U.brl0(eq)} em vendas. Você já vendeu ${U.brl0(m.cur.vendas)}.`, causa: 'Abaixo desse valor você trabalha para pagar as contas; acima dele começa o lucro.', impacto: falta > 0 ? `Faltam ${U.brl0(falta)} para empatar o mês.` : `Você já passou do ponto de equilíbrio em ${U.brl0(m.cur.vendas - eq)} — isso já é lucro.`, acao: falta > 0 ? `Isso dá cerca de ${U.brl0(falta / dias)} por dia até o fim do mês. Foque nos produtos de maior margem e em recuperar clientes sumidos.` : 'Defina uma meta acima do equilíbrio (por exemplo +20%) e acompanhe pelo painel Início.' };
  },

  qCash(S) {
    if (!S.transactions.length) return { dado: 'Ainda não há lançamentos financeiros.', causa: 'O caixa é calculado pelo que já foi recebido e pago.', impacto: 'Sem isso, não há como avaliar a saúde do caixa.', acao: 'Lance suas contas a pagar e a receber no Financeiro.' };
    const cash = this.cash(S), pr = this.cashProjection(S, 30); const T = U.today();
    const pagar = S.transactions.filter(t => !t.paid_date && t.kind === 'despesa' && t.due_date <= U.addDays(T, 30)).reduce((s, t) => s + Number(t.amount), 0);
    const receber = S.transactions.filter(t => !t.paid_date && t.kind === 'receita' && t.due_date <= U.addDays(T, 30)).reduce((s, t) => s + Number(t.amount), 0);
    const saudavel = !pr.firstNegative && cash >= pagar * 0.5;
    return { dado: `Caixa hoje: ${U.brl(cash)}. Nos próximos 30 dias: ${U.brl(pagar)} a pagar e ${U.brl(receber)} a receber. Saldo previsto: ${U.brl(pr.end)}.`, causa: pr.firstNegative ? `O saldo fica negativo em ${U.fmtDate(pr.firstNegative.day)} se nada mudar.` : (saudavel ? 'Os recebimentos e o saldo atual cobrem as contas do mês.' : 'O saldo cobre as contas, mas com pouca folga.'), impacto: pr.firstNegative ? 'Risco de atrasar pagamentos e pagar juros.' : saudavel ? 'Você tem tranquilidade para operar e investir um pouco.' : 'Qualquer atraso de cliente pode apertar o caixa.', acao: pr.firstNegative ? 'Cobre os recebimentos em aberto, negocie prazo com fornecedores e segure compras não urgentes.' : saudavel ? 'Considere separar uma reserva equivalente a 1 mês de despesas.' : 'Antecipe cobranças e evite novas compras até o caixa ganhar folga.' };
  },

  qMargin(S) {
    const rows = S.products.filter(p => Number(p.price) > 0).map(p => ({ p, st: this.productStats(S, p) })).sort((a, b) => a.st.margin - b.st.margin);
    const target = Number(S.company?.target_margin || 30); const low = rows.filter(x => x.st.margin < target);
    const per = this.period('mes'); const m = this.metrics(S, per);
    const bigDesc = S.sales.filter(s => this.inRange(s.sold_at, per.start, per.end) && Number(s.discount) > 0).reduce((t, s) => t + Number(s.discount), 0);
    if (!rows.length) return { dado: 'Não há produtos cadastrados.', causa: 'A margem é calculada a partir de custo, taxas e preço.', impacto: 'Sem isso, você não sabe quanto realmente ganha em cada venda.', acao: 'Cadastre seus produtos com custo e preço.' };
    return { dado: `Margem média das vendas do mês: ${U.pct(m.cur.margem, 0)} (meta ${U.pct(target, 0)}).${low.length ? ` ${low.length} produto(s) abaixo da meta, o pior é ${low[0].p.name} com ${U.pct(low[0].st.margin, 0)}.` : ' Todos os produtos estão acima da meta.'}${bigDesc ? ` Você deu ${U.brl0(bigDesc)} em descontos no mês.` : ''}`, causa: low.length ? 'O custo de compra e as taxas (cartão/comissão) estão altos em relação ao preço desses itens.' : 'Preços e custos estão equilibrados.', impacto: low.length ? `Cada venda desses produtos rende menos do que o esperado, reduzindo o lucro do mês.` : 'A margem protege o seu resultado.', acao: low.length ? `Reajuste o preço de ${low[0].p.name} ou negocie o custo com o fornecedor. Use a Precificação para achar o preço ideal.` : 'Continue acompanhando: mudanças de custo de fornecedor corroem margem sem aviso.' };
  },

  qRestock(S) {
    const rows = S.products.filter(p => !p.is_service && p.active !== false).map(p => ({ p, st: this.productStats(S, p) }));
    const need = rows.filter(x => Number(x.p.stock) <= Number(x.p.min_stock) || (x.st.daysLeft !== null && x.st.daysLeft <= 10)).sort((a, b) => (a.st.daysLeft ?? 999) - (b.st.daysLeft ?? 999));
    if (!need.length) return { dado: 'Nenhum produto precisa de reposição agora.', causa: 'Todos estão acima do estoque mínimo e com giro compatível.', impacto: 'Sem risco imediato de perder vendas por falta de produto.', acao: 'Evite comprar em excesso; capital parado em estoque pesa no caixa.' };
    const cost = need.reduce((s, x) => s + Math.max(Number(x.p.min_stock) * 2 - Number(x.p.stock), 0) * Number(x.p.cost), 0);
    return { dado: `Repor com prioridade: ${need.slice(0, 5).map(x => `${x.p.name} (${x.p.stock} un.${x.st.daysLeft !== null ? `, acaba em ~${x.st.daysLeft} dias` : ''})`).join('; ')}.`, causa: 'Esses itens estão no estoque mínimo ou vendendo mais rápido do que o estoque suporta.', impacto: 'Faltar produto que vende bem é venda perdida e cliente insatisfeito.', acao: `Faça o pedido ao fornecedor. Para chegar a 2x o estoque mínimo, o investimento estimado é ${U.brl0(cost)} — confira se o caixa comporta.` };
  },

  qIdle(S) {
    const idle = S.products.map(p => ({ p, st: this.productStats(S, p) })).filter(x => x.st.idle);
    if (!idle.length) return { dado: 'Nenhum produto está parado há mais de 90 dias.', causa: 'O estoque está girando.', impacto: 'Seu dinheiro não está preso em mercadoria.', acao: 'Mantenha o acompanhamento mensal.' };
    const v = idle.reduce((s, x) => s + x.st.stockValue, 0);
    return { dado: `${idle.length} produto(s) sem venda há mais de 90 dias, somando ${U.brl0(v)} em estoque: ${idle.slice(0, 4).map(x => x.p.name).join(', ')}.`, causa: 'Podem estar com preço acima do mercado, pouca divulgação ou baixa procura.', impacto: `${U.brl0(v)} do seu dinheiro está parado em prateleira.`, acao: 'Monte uma promoção ou combo com esses itens, divulgue para clientes antigos e, se preciso, venda pelo custo para liberar caixa.' };
  }
};

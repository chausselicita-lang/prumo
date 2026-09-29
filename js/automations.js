// Automações do Prumo: QUANDO (gatilho) → ENTÃO (ação) → E (ação extra).
// Roda no próprio app: eventos disparam na hora; condições são verificadas ao abrir o app (e ao ativar).
window.PE = window.PE || {};
(function () {
  const U = PE.u;
  const STAGE_LABEL = { novo: 'Novo lead', contato: 'Contato', negociacao: 'Negociação', proposta: 'Proposta', venda: 'Venda', posvenda: 'Pós-venda' };

  PE.auto = {
    lastScan: 0,
    stageLabel: STAGE_LABEL,
    triggers: {
      venda_registrada: { label: 'Um cliente comprar', kind: 'evento' },
      cliente_cadastrado: { label: 'Um cliente for cadastrado', kind: 'evento' },
      oportunidade_etapa: { label: 'Uma oportunidade mudar de etapa', kind: 'evento', stage: true },
      cliente_sem_comprar: { label: 'Um cliente ficar dias sem comprar', kind: 'condição', days: 90, daysLabel: 'Dias sem comprar' },
      conta_vencendo: { label: 'Uma conta a pagar estiver perto de vencer', kind: 'condição', days: 3, daysLabel: 'Avisar com quantos dias de antecedência' },
      recebimento_atrasado: { label: 'Um recebimento estiver atrasado', kind: 'condição', days: 3, daysLabel: 'Dias de atraso' },
      aniversario: { label: 'For aniversário de um cliente', kind: 'condição', days: 0, daysLabel: 'Dias de antecedência (0 = no dia)' },
      estoque_baixo: { label: 'O estoque de um produto ficar abaixo do mínimo', kind: 'condição' },
      proposta_parada: { label: 'Uma proposta ficar dias sem resposta', kind: 'condição', days: 3, daysLabel: 'Dias sem resposta' }
    },
    actionTypes: { criar_tarefa: 'Criar uma tarefa', criar_followup: 'Agendar follow-up com o cliente', criar_oportunidade: 'Criar uma oportunidade de venda' },
    vars: '{cliente} {produto} {estoque} {valor} {dias} {descricao} {vencimento} {titulo} {etapa}',

    presets: [
      { key: 'sumido', name: 'Cliente sumido → tarefa de contato', why: 'Recupera vendas de quem parou de comprar.', trigger: { type: 'cliente_sem_comprar', params: { days: 90 } }, actions: [{ type: 'criar_tarefa', params: { title: 'Chamar {cliente} no WhatsApp (sem comprar há {dias} dias)', category: 'vendas', priority: 'media', due_days: 1 } }] },
      { key: 'posvenda', name: 'Compra registrada → follow-up pós-venda', why: 'Fideliza e abre espaço para a próxima venda.', trigger: { type: 'venda_registrada' }, actions: [{ type: 'criar_followup', params: { title: 'Pós-venda: perguntar a {cliente} como foi a compra', due_days: 3 } }] },
      { key: 'estoque', name: 'Estoque baixo → tarefa de reposição', why: 'Evita perder venda por falta de produto.', trigger: { type: 'estoque_baixo' }, actions: [{ type: 'criar_tarefa', params: { title: 'Repor {produto} (restam {estoque})', category: 'estoque', priority: 'alta', due_days: 1 } }] },
      { key: 'conta', name: 'Conta vencendo → tarefa de pagamento', why: 'Evita juros e multa por esquecimento.', trigger: { type: 'conta_vencendo', params: { days: 3 } }, actions: [{ type: 'criar_tarefa', params: { title: 'Pagar {descricao} ({valor}), vence em {vencimento}', category: 'financeiro', priority: 'alta', due_days: 0 } }] },
      { key: 'cobranca', name: 'Recebimento atrasado → tarefa de cobrança', why: 'Cobra a tempo e protege o caixa.', trigger: { type: 'recebimento_atrasado', params: { days: 3 } }, actions: [{ type: 'criar_tarefa', params: { title: 'Cobrar {cliente}: {valor} venceu em {vencimento}', category: 'financeiro', priority: 'alta', due_days: 0 } }] },
      { key: 'aniversario', name: 'Aniversário → tarefa de mensagem', why: 'Um parabéns aproxima e gera venda.', trigger: { type: 'aniversario', params: { days: 0 } }, actions: [{ type: 'criar_tarefa', params: { title: 'Parabenizar {cliente} pelo aniversário', category: 'vendas', priority: 'media', due_days: 0 } }] },
      { key: 'proposta', name: 'Proposta parada → follow-up', why: 'Nenhuma proposta fica esquecida.', trigger: { type: 'proposta_parada', params: { days: 3 } }, actions: [{ type: 'criar_followup', params: { title: 'Cobrar resposta da proposta "{titulo}" de {cliente}', due_days: 0 } }] },
      { key: 'novo', name: 'Novo cliente → follow-up em 2 dias', why: 'Boas-vindas rápidas aumentam a recompra.', trigger: { type: 'cliente_cadastrado' }, actions: [{ type: 'criar_followup', params: { title: 'Dar boas-vindas a {cliente}', due_days: 2 } }] }
    ],

    /* ---------- Texto legível ---------- */
    describeTrigger(t) {
      const d = t.params?.days;
      return ({
        venda_registrada: 'um cliente comprar', cliente_cadastrado: 'um cliente for cadastrado',
        oportunidade_etapa: `uma oportunidade for movida para ${t.params?.stage ? '“' + STAGE_LABEL[t.params.stage] + '”' : 'qualquer etapa'}`,
        cliente_sem_comprar: `um cliente ficar ${d ?? 90} dias sem comprar`, conta_vencendo: `uma conta a pagar vencer em até ${d ?? 3} dias`,
        recebimento_atrasado: `um recebimento atrasar ${d ?? 3} dias`, aniversario: d ? `faltar ${d} dias para o aniversário de um cliente` : 'for aniversário de um cliente',
        estoque_baixo: 'o estoque de um produto ficar abaixo do mínimo', proposta_parada: `uma proposta ficar ${d ?? 3} dias sem resposta`
      })[t.type] || t.type;
    },
    describeAction(a) {
      const due = Number(a.params?.due_days || 0), when = due ? ` (prazo: ${due} dia${due > 1 ? 's' : ''})` : ' (para hoje)';
      const title = a.params?.title || '';
      return ({ criar_tarefa: `criar a tarefa “${title}”${when}`, criar_followup: `agendar o follow-up “${title}”${when}`, criar_oportunidade: `criar a oportunidade “${title}”` })[a.type] || a.type;
    },
    render(tpl, v) { return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? '')).replace(/\s+/g, ' ').trim(); },
    varsOf(ctx) {
      return { cliente: ctx.customer?.name || 'cliente', produto: ctx.product?.name || '', estoque: ctx.product ? Number(ctx.product.stock) : '', valor: ctx.valor !== undefined ? U.brl(ctx.valor) : '', dias: ctx.dias ?? '', descricao: ctx.descricao || '', vencimento: ctx.vencimento ? U.fmtDate(ctx.vencimento) : '', titulo: ctx.titulo || '', etapa: ctx.etapa || '' };
    },

    /* ---------- Execução ---------- */
    /** Reserva a execução (evita repetir para o mesmo item e a corrida entre duas pessoas com o app aberto). */
    async claim(key, cooldownDays) {
      const S = PE.state, T = U.today(), ex = S.notifications.filter(n => n.alert_key === key);
      if (ex.some(n => n.dismissed_until && n.dismissed_until >= T)) return false;
      try {
        for (const n of ex) await PE.db.remove('notifications', n.id);
        await PE.db.insert('notifications', { alert_key: key, dismissed_until: U.addDays(T, cooldownDays) });
        return true;
      } catch { return false; }
    },
    async doAction(act, ctx, vars) {
      const p = act.params || {}, T = U.today(), c = ctx.customer;
      const title = this.render(p.title || 'Tarefa automática', vars), due = U.addDays(T, Number(p.due_days || 0));
      if (act.type === 'criar_tarefa') {
        await PE.db.insert('tasks', { title, category: p.category || 'administrativo', priority: p.priority || 'media', status: 'aberta', due_date: due, customer_id: c?.id || null, recurrence: 'nenhuma' });
        return 'tarefa';
      }
      if (act.type === 'criar_followup') {
        if (!c) return null;
        await PE.db.insert('tasks', { title, category: 'vendas', priority: 'media', status: 'aberta', due_date: due, customer_id: c.id, recurrence: 'nenhuma' });
        await PE.db.update('customers', c.id, { next_action: title, next_action_date: due });
        return 'follow-up';
      }
      if (act.type === 'criar_oportunidade') {
        await PE.db.insert('opportunities', { customer_id: c?.id || null, title, value: Number(p.value) || Number(ctx.sale?.total) || 0, stage: 'novo', next_action: 'Entrar em contato', next_action_date: due });
        return 'oportunidade';
      }
      return null;
    },
    async execute(auto, ctx, key, cooldown) {
      if (!(await this.claim(key, cooldown))) return 0;
      const vars = this.varsOf(ctx), made = [];
      for (const act of auto.actions || []) {
        try { const r = await this.doAction(act, ctx, vars); if (r) made.push(r); } catch (e) { console.warn('Automação falhou:', auto.name, e); }
      }
      if (this.onRun) this.onRun(auto, made);
      return 1;
    },

    /** Gatilhos de evento: chamados pelo app quando a coisa acontece. */
    async emit(name, ctx) {
      let n = 0;
      for (const a of PE.state.automations.filter(x => x.active && x.trigger?.type === name)) {
        if (name === 'oportunidade_etapa' && a.trigger.params?.stage && a.trigger.params.stage !== ctx.etapaKey) continue;
        const id = name === 'venda_registrada' ? ctx.sale.id : name === 'cliente_cadastrado' ? ctx.customer.id : `${ctx.opp.id}:${ctx.etapaKey}`;
        n += await this.execute(a, ctx, `au:${a.id}:${id}`, 365);
      }
      return n;
    },

    /** Gatilhos de condição: varre os dados e devolve o que atende. */
    candidates(S, type, days) {
      const T = U.today(), E = PE.engine, out = [];
      if (type === 'cliente_sem_comprar') S.customers.forEach(c => { const st = E.customerStats(S, c); if (st.count > 0 && st.since >= days) out.push({ id: c.id, cooldown: 30, ctx: { customer: c, dias: st.since } }); });
      if (type === 'conta_vencendo') S.transactions.filter(t => t.kind === 'despesa' && !t.paid_date && t.due_date >= T && t.due_date <= U.addDays(T, days)).forEach(t => out.push({ id: t.id, cooldown: 365, ctx: { descricao: t.description, valor: Number(t.amount), vencimento: t.due_date, dias: U.daysBetween(T, t.due_date) } }));
      if (type === 'recebimento_atrasado') S.transactions.filter(t => t.kind === 'receita' && !t.paid_date && t.due_date <= U.addDays(T, -days)).forEach(t => out.push({ id: t.id, cooldown: 14, ctx: { customer: S.customers.find(c => c.id === t.customer_id), descricao: t.description, valor: Number(t.amount), vencimento: t.due_date, dias: U.daysBetween(t.due_date, T) } }));
      if (type === 'aniversario') S.customers.filter(c => c.birthday).forEach(c => { for (let i = 0; i <= days; i++) { const d = U.addDays(T, i); if (d.slice(5) === c.birthday.slice(5)) { out.push({ id: `${c.id}:${d.slice(0, 4)}`, cooldown: 300, ctx: { customer: c, dias: i } }); break; } } });
      if (type === 'estoque_baixo') S.products.filter(p => !p.is_service && p.active !== false && Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock)).forEach(p => out.push({ id: p.id, cooldown: 7, ctx: { product: p } }));
      if (type === 'proposta_parada') S.opportunities.filter(o => o.stage === 'proposta' && U.daysBetween((o.updated_at || o.created_at).slice(0, 10), T) >= days).forEach(o => out.push({ id: o.id, cooldown: 7, ctx: { customer: S.customers.find(c => c.id === o.customer_id), titulo: o.title, valor: Number(o.value), dias: U.daysBetween((o.updated_at || o.created_at).slice(0, 10), T) } }));
      return out;
    },
    /** Verifica as condições. Só administrador e gerente rodam a varredura (têm acesso a todos os dados). */
    async runScan(force) {
      if (!['administrador', 'gerente'].includes(PE.perm.current())) return 0;
      if (!force && Date.now() - this.lastScan < 5 * 60 * 1000) return 0;
      this.lastScan = Date.now();
      let total = 0;
      for (const a of PE.state.automations.filter(x => x.active)) {
        const t = a.trigger || {}, meta = this.triggers[t.type]; if (!meta || meta.kind !== 'condição') continue;
        const days = Number(t.params?.days ?? meta.days ?? 0);
        for (const c of this.candidates(PE.state, t.type, days).slice(0, 25)) total += await this.execute(a, c.ctx, `au:${a.id}:${c.id}`, c.cooldown);
      }
      return total;
    },

    /* ---------- Resultado medido ---------- */
    runs(S, autoId, days = 30) {
      const from = U.addDays(U.today(), -days);
      return S.notifications.filter(n => n.alert_key.startsWith('au:' + (autoId ? autoId + ':' : '')) && (n.created_at || '').slice(0, 10) >= from);
    }
  };
})();

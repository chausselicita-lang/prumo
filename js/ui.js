// Componentes de interface do Prumo: ícones, toasts, modais, formulários e gráficos.
window.PE = window.PE || {};
const { esc } = PE.u;

PE.ui = {
  range: 'mes', custom: null, acts: {},

  /* ---------- Ícones (traços simples) ---------- */
  icons: {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2.2.6 3.5 2.6 3.5 5.5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.5h11L21 7H6"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h13v4"/><path d="M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l3 3 5-6"/>',
    bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    spark: '<path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 00-2.2 1.3l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.1 1.3l-2 1.5 2 3.4 2.3-.9a7 7 0 002.2 1.3L10 21h4l.4-2.4a7 7 0 002.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
    chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/><path d="M9 11h6M9 14h4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M10 20v-5h4v5"/>',
    megaphone: '<path d="M3 11v3a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    calc: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    logout: '<path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 8l4 4-4 4M20 12H9"/>'
  },
  ico(name, size = 20) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.icons[name] || ''}</svg>`; },

  /* ---------- Toast ---------- */
  toast(msg, type = 'ok') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg; box.appendChild(el);
    setTimeout(() => el.remove(), type === 'err' ? 5500 : 3200);
  },

  /* ---------- Executa ação assíncrona com tratamento de erro ---------- */
  async run(fn, btn) {
    if (btn) btn.disabled = true;
    try { return await fn(); }
    catch (e) { console.error(e); PE.ui.toast(e.message || 'Algo deu errado. Tente novamente.', 'err'); }
    finally { if (btn) btn.disabled = false; }
  },

  /* ---------- Modal ---------- */
  modal({ title, body, footer = '', onMount, wide }) {
    const reopening = !!document.getElementById('modal-ov');
    this.closeModal({ silent: true });
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="width:min(820px,100%)"' : ''}>
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close-modal" aria-label="Fechar">${this.ico('x', 18)}</button></div>
      <div class="modal-body">${body}${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div></div>`;
    ov.addEventListener('mousedown', e => { if (e.target === ov) this.closeModal(); });
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    if (!reopening) PE.nav.open();
    if (onMount) onMount(ov.querySelector('.modal'));
    return ov;
  },
  closeModal(opts) {
    const el = document.getElementById('modal-ov'); if (!el) return;
    el.remove(); document.body.style.overflow = '';
    if (!(opts && opts.silent)) PE.nav.close(opts && opts.noBack);
  },

  /* ---------- Formulário genérico ---------- */
  fieldHTML(f, v) {
    const val = v[f.name] ?? f.value ?? '';
    const cls = f.full ? 'field full' : 'field';
    let input;
    if (f.type === 'select') input = `<select class="input" name="${f.name}" ${f.required ? 'required' : ''}>${(f.options || []).map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea class="input" name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
    else if (f.type === 'checkbox') input = `<label class="row" style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink);font-weight:500"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.checkLabel || '')}</label>`;
    else input = `<input class="input" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.list ? `list="dl-${f.name}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''}>${f.list ? `<datalist id="dl-${f.name}">${f.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
    return `<div class="${cls}"><label>${esc(f.label)}</label>${input}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
  },
  readForm(form, fields) {
    const out = {};
    fields.forEach(f => {
      const el = form.elements[f.name]; if (!el) return;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = el.value.trim() === '' ? null : el.value.trim();
    });
    return out;
  },
  form({ title, fields, values = {}, submitLabel = 'Salvar', onSubmit, extraFooter = '' }) {
    const body = `<form id="pe-form" class="stack" novalidate><div class="form-grid">${fields.map(f => this.fieldHTML(f, values)).join('')}</div>
      <div class="modal-foot">${extraFooter}<button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></div></form>`;
    this.modal({
      title, body, onMount: m => {
        const form = m.querySelector('#pe-form'); form.querySelector('input,select,textarea')?.focus();
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const bad = fields.find(f => f.required && !form.elements[f.name]?.value?.toString().trim());
          if (bad) { PE.ui.toast(`Preencha: ${bad.label}`, 'err'); form.elements[bad.name].focus(); return; }
          const btn = form.querySelector('[type=submit]');
          await PE.ui.run(async () => { await onSubmit(PE.ui.readForm(form, fields), form); }, btn);
        });
      }
    });
  },
  confirm(msg, onYes, label = 'Excluir') {
    this.modal({ title: 'Tem certeza?', body: `<p>${esc(msg)}</p>`, footer: `<button class="btn ghost" data-act="close-modal">Cancelar</button><button class="btn danger" id="cf-yes">${esc(label)}</button>`, onMount: m => { m.querySelector('#cf-yes').onclick = async e => { await PE.ui.run(async () => { await onYes(); PE.ui.closeModal(); }, e.currentTarget); }; } });
  },

  /* ---------- Gráficos simples ---------- */
  bars(series, { highlightLast = true, fmt = v => PE.u.brl0(v) } = {}) {
    const max = Math.max(...series.map(s => s.value), 1);
    const step = Math.ceil(series.length / 12);
    return `<div class="bars">${series.map((s, i) => `<div class="bar-col" title="${esc(s.label)}: ${fmt(s.value)}"><div class="bar ${highlightLast && i === series.length - 1 ? 'hi' : ''}" style="height:${Math.max(2, s.value / max * 100)}%"></div><span class="lbl">${i % step === 0 ? esc(s.label) : '&nbsp;'}</span></div>`).join('')}</div>`;
  },
  line(points, { height = 120, neg = true } = {}) {
    const w = 600, h = height, pad = 6;
    const vals = points.map(p => p.bal), min = Math.min(...vals, 0), max = Math.max(...vals, 1), rng = max - min || 1;
    const x = i => pad + i / Math.max(points.length - 1, 1) * (w - pad * 2), y = v => h - pad - (v - min) / rng * (h - pad * 2);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join(' ');
    const zero = y(0);
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="Projeção de caixa">
      <line x1="0" x2="${w}" y1="${zero}" y2="${zero}" stroke="var(--silver)" stroke-dasharray="4 4"/>
      <path d="${path} L${x(points.length - 1)},${zero} L${x(0)},${zero} Z" fill="rgba(249,115,22,.10)"/>
      <path d="${path}" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  },

  empty(icon, title, text, cta = '') { return `<div class="empty"><div class="em-ico">${icon}</div><h3>${esc(title)}</h3><p class="small" style="max-width:340px">${esc(text)}</p>${cta}</div>`; },
  chip(text, cls = '') { return `<span class="chip ${cls}">${esc(text)}</span>`; }
};

// Delegação global de eventos: qualquer elemento com data-act dispara PE.ui.acts[nome]
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = PE.ui.acts[el.dataset.act]; if (!fn) return;
  if (el.dataset.act !== 'close-modal') e.preventDefault();
  Promise.resolve(fn(el.dataset, el)).catch(err => { console.error(err); PE.ui.toast(err.message || 'Erro inesperado', 'err'); });
});
PE.ui.acts['close-modal'] = (_d, el) => PE.ui.closeModal(el && el.tagName === 'A' ? { noBack: true } : undefined);
document.addEventListener('keydown', e => { if (e.key === 'Escape') PE.ui.closeModal(); });

/* Botão "voltar" do celular: fecha janela e menu lateral antes de sair da tela.
   Ao abrir uma janela/menu, cria uma entrada no histórico; ao voltar, fecha o que estiver aberto. */
PE.nav = {
  _entry: false, _backing: false, _want: false,
  open() {
    if (this._backing) { this._want = true; return; }
    if (this._entry) return;
    history.pushState({ pe: 1 }, ''); this._entry = true;
  },
  close(noBack) {
    if (!this._entry) return;
    this._entry = false;
    if (noBack) return;               // vamos navegar em seguida: a entrada fica e é pulada depois
    this._backing = true; history.back();
  },
  onPop(e) {
    if (this._backing) {
      this._backing = false;
      if (this._want) { this._want = false; if (document.getElementById('modal-ov') || document.querySelector('.app.drawer-open')) { history.pushState({ pe: 1 }, ''); this._entry = true; } }
      return;
    }
    const app = document.querySelector('.app');
    if (document.getElementById('modal-ov')) { this._entry = false; PE.ui.closeModal({ silent: true }); return; }
    if (app && app.classList.contains('drawer-open')) { this._entry = false; app.classList.remove('drawer-open'); return; }
    if (e.state && e.state.pe) history.back();   // entrada sobrando de janela já fechada: pula
  }
};
window.addEventListener('popstate', e => PE.nav.onPop(e));

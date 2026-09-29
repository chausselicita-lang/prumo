# Prumo — Plataforma do Pequeno Empreendedor

Copiloto de gestão para MEIs e pequenos negócios. HTML/CSS/JS puro + Supabase (sem build).

## Colocar no ar (Supabase `khpmenwzknkkpclpgsps`)
1. Abra o SQL Editor do projeto e execute **`supabase/schema.sql`** inteiro (idempotente; tabelas com prefixo `pe_`, RLS multi-tenant).
2. Em *Project Settings > API*, copie a **anon public key** e cole em `js/config.js` (`SUPABASE_ANON_KEY`).
3. Em *Authentication > URL Configuration*, adicione a URL onde o app será hospedado.
4. Publique a pasta (GitHub Pages, Vercel, etc.) ou teste local: `python -m http.server 5177` e abra `http://localhost:5177`.

Sem a anon key o app roda em **modo demonstração** (dados só no navegador).

## Estrutura
- `index.html` landing · `app.html` aplicação
- `js/store.js` dados (Supabase ou local) · `js/engine.js` métricas, alertas, precificação, Consultor
- `js/ui.js` componentes · `js/app.js` telas

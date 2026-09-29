// Configuração do Prumo.
// A anon key do Supabase é pública por design (a segurança vem do RLS do schema.sql).
// Cole-a abaixo: Supabase > Project Settings > API > "anon public".
// Enquanto estiver vazia, o app roda em MODO DEMONSTRAÇÃO (dados só neste navegador).
window.PE = window.PE || {};
PE.config = {
  SUPABASE_URL: 'https://khpmenwzknkkpclpgsps.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocG1lbnd6a25ra3BjbHBnc3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDEwMDcsImV4cCI6MjEwNjExNzAwN30._GXUSZWRmqnQodR6v57Y7lZEHAgqSpBQ_-47imOwpug'
};

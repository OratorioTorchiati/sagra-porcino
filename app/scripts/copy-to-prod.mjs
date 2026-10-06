// npm run prod:copy — copia i contenuti dal progetto di dev a quello di produzione (appena creato con supabase/setup.sql):
// domande del quiz, menù, impostazioni (sezioni, giochi, tentativi, orari, aspetto…), mappa (immagine, angoli e punti).
// NON copia: giocatori, partite, recensioni, eventi del calendario (quelli di dev sono di prova), account staff.
//
// Credenziali in app/.env.local (mai nel repository):
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY       dev (le righe attive)
//   # VITE_SUPABASE_URL / # VITE_SUPABASE_ANON_KEY   prod (le righe commentate sotto "PROD")
//   TEST_STAFF_NICKNAME / TEST_STAFF_PASSWORD         Admin di dev
//   PROD_STAFF_NICKNAME / PROD_STAFF_PASSWORD         Admin di prod
// Le parti già presenti su prod (domande, punti della mappa) non vengono copiate di nuovo.

import fs from 'node:fs';

const PROD_REF = 'qasriofmaclcbppclmzz';
const text = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const lines = text.split(/\r?\n/);
const value = (line) => line.slice(line.indexOf('=') + 1).trim();
const env = Object.fromEntries(lines.filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), value(l)]));
const commented = (key) => lines.map((l) => l.trim()).find((l) => new RegExp(`^#\\s*${key}=`).test(l));
const prod = { url: commented('VITE_SUPABASE_URL') && value(commented('VITE_SUPABASE_URL')), key: commented('VITE_SUPABASE_ANON_KEY') && value(commented('VITE_SUPABASE_ANON_KEY')) };
const dev = { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY };

if (!prod.url?.includes(PROD_REF)) throw new Error('Non trovo le righe di prod (commentate) in .env.local.');
if (dev.url?.includes(PROD_REF)) throw new Error('Le righe attive puntano già a prod: serve dev come sorgente.');
for (const k of ['TEST_STAFF_NICKNAME', 'TEST_STAFF_PASSWORD', 'PROD_STAFF_NICKNAME', 'PROD_STAFF_PASSWORD']) {
  if (!env[k]) throw new Error(`Manca ${k} in app/.env.local.`);
}

const client = ({ url, key }) => async (name, params = {}) => {
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify(params) });
  return r.json();
};
const devRpc = client(dev);
const prodRpc = client(prod);

const devLogin = await devRpc('login', { p_nickname: env.TEST_STAFF_NICKNAME, p_secret: env.TEST_STAFF_PASSWORD });
const prodLogin = await prodRpc('login', { p_nickname: env.PROD_STAFF_NICKNAME, p_secret: env.PROD_STAFF_PASSWORD });
if (!devLogin.ok) throw new Error(`Accesso a dev non riuscito: ${devLogin.error}`);
if (!prodLogin.ok) throw new Error(`Accesso a prod non riuscito: ${prodLogin.error}`);
const D = (name, params = {}) => devRpc(`staff_${name}`, { p_token: devLogin.token, ...params });
const P = (name, params = {}) => prodRpc(`staff_${name}`, { p_token: prodLogin.token, ...params });
const report = [];
const must = (res, what) => {
  if (!res?.ok) throw new Error(`${what}: ${res?.error ?? JSON.stringify(res)}`);
  return res;
};

try {
  // 1. Domande del quiz (solo se prod non ne ha ancora)
  const devQuiz = must(await D('quiz_list'), 'domande di dev').questions;
  const prodQuiz = must(await P('quiz_list'), 'domande di prod').questions;
  if (prodQuiz.length) report.push(`quiz: prod ha già ${prodQuiz.length} domande, non copiate`);
  else {
    const saved = must(await P('quiz_save', { p_questions: devQuiz.map(({ text, options, correct, active }) => ({ text, options, correct, active })) }), 'domande');
    report.push(`quiz: ${saved.saved} domande (${saved.active} attive)`);
  }

  // 2. Menù
  const menu = (await devRpc('get_menu')).menu;
  if (menu?.categories?.length) {
    const saved = must(await P('set_menu', { p_menu: { categories: menu.categories } }), 'menù');
    report.push(`menù: ${menu.categories.length} categorie, ${saved.dishes} piatti`);
    // piatti terminati: su prod si parte con tutto disponibile
  } else report.push('menù: niente su dev');

  // 3. Impostazioni e giochi
  const s = must(await D('get_settings'), 'impostazioni di dev');
  must(await P('update_settings', {
    p_values: {
      attempts_per_day: s.attempts_per_day,
      attempts_reset_hour: s.attempts_reset_hour,
      games_open_from: s.games_open_from ?? null,
      games_open_until: s.games_open_until ?? null,
      sections: s.sections,
      winners: s.winners,
      leaderboard_public: s.leaderboard_public,
      sections_order: s.sections_order,
      feedback_anonymous: s.feedback_anonymous,
      sponsor_columns: s.sponsor_columns,
      map_osm: s.map_osm,
      games: Object.fromEntries(s.games.map((g) => [g.id, g.enabled])),
    },
  }), 'impostazioni');
  for (const g of s.games) {
    const params = g.id === 'quiz' ? { p_game_id: g.id, p_seconds: Math.round(g.duration_s / g.steps), p_steps: g.steps } : { p_game_id: g.id, p_seconds: g.duration_s };
    must(await P('set_game', params), `gioco ${g.id}`);
  }
  report.push(`impostazioni: sezioni ${Object.entries(s.sections).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')}; ${s.games.length} giochi`);

  // 4. Mappa: immagine, angoli e punti
  const img = await devRpc('get_map_image');
  if (img.ok) {
    must(await P('set_map_image', { p_mime: img.mime, p_data: img.data, p_width: img.width, p_height: img.height }), 'immagine della mappa');
    const b = s.map_bounds;
    if (b) must(await P('set_map_bounds', { p_south: b.south, p_west: b.west, p_north: b.north, p_east: b.east, p_place: b.place ?? null, p_source: b.source ?? null }), 'angoli della mappa');
    const devMap = await devRpc('get_map');
    const prodMap = await prodRpc('get_map');
    if (prodMap.points?.length) report.push(`mappa: immagine copiata; prod ha già ${prodMap.points.length} punti, non copiati`);
    else {
      for (const p of devMap.points) {
        must(await P('map_save_point', { p_id: null, p_type: p.type, p_title: p.title, p_description: p.description, p_x: p.x, p_y: p.y }), `punto ${p.title}`);
      }
      report.push(`mappa: immagine ${img.width}×${img.height}${b ? `, angoli (${b.place ?? ''})` : ''}, ${devMap.points.length} punti`);
    }
  } else report.push('mappa: niente su dev');
} finally {
  await devRpc('logout', { p_token: devLogin.token }).catch(() => null);
  await prodRpc('logout', { p_token: prodLogin.token }).catch(() => null);
  console.log(report.map((r) => `✅ ${r}`).join('\n'));
}

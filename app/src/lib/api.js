// Chiamate al server (Supabase): solo funzioni RPC, con fetch diretto (niente librerie: sito più leggero).
// URL e chiave pubblica arrivano dalle variabili d'ambiente di Vite (app/.env.local in locale,
// secrets di GitHub Actions nel deploy). La chiave "publishable"/"anon" è pubblica per definizione.

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false se il sito è stato costruito senza configurazione del server (es. build locale senza .env) */
export const serverConfigured = Boolean(URL && KEY);

/** Errore di rete (niente connessione, server irraggiungibile): da distinguere dagli errori "veri". */
export class NetworkError extends Error {}

/**
 * Chiama una funzione RPC. I parametri vanno col prefisso p_ come nelle funzioni SQL.
 * Restituisce il JSON della funzione ({ ok, error, ... }).
 */
export async function rpc(name, params = {}) {
  if (!serverConfigured) throw new NetworkError('Server non configurato');
  const headers = { 'Content-Type': 'application/json', apikey: KEY };
  // Le vecchie chiavi "anon" sono JWT e vanno anche in Authorization; le nuove "sb_publishable_" no
  if (!KEY.startsWith('sb_')) headers.Authorization = `Bearer ${KEY}`;

  let response;
  try {
    response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
  } catch (error) {
    throw new NetworkError(error.message);
  }
  if (!response.ok) {
    // 5xx o gateway: trattati come problema di rete temporaneo
    if (response.status >= 500 || response.status === 0) throw new NetworkError(`HTTP ${response.status}`);
    const body = await response.text();
    throw new Error(`RPC ${name}: HTTP ${response.status} ${body}`);
  }
  return response.json();
}

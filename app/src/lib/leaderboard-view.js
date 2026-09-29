// Come si divide la classifica sullo schermo (funzione pura, con test):
// podio (posizioni 1–3, con i pari merito sullo stesso gradino), righe dal 4° in poi, e la mia riga
// a parte se non sono tra i primi 20.

export const PRIZE_POSITIONS = 10;

/**
 * @param {Array<{position, nickname, avatar, total}>} top primi 20 (con i pari merito), in ordine
 * @param {{nickname, position, total, avatar}|null} me la mia scheda (null se non ho un account)
 */
export function leaderboardView(top, me) {
  const isMe = (entry) => Boolean(me) && entry.nickname.toLowerCase() === me.nickname.toLowerCase();
  const mark = (entry) => ({ ...entry, isMe: isMe(entry), prize: entry.position <= PRIZE_POSITIONS });

  const podium = { 1: [], 2: [], 3: [] };
  const rows = [];
  for (const entry of top.map(mark)) {
    if (entry.position <= 3) podium[entry.position].push(entry);
    else rows.push(entry);
  }
  const inTop = top.some(isMe);
  const meOutside = me && !inTop && me.position ? mark({ position: me.position, nickname: me.nickname, avatar: me.avatar, total: me.total }) : null;
  return { podium, rows, meOutside };
}

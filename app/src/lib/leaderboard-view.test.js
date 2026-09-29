import { describe, expect, it } from 'vitest';
import { leaderboardView } from './leaderboard-view.js';

const entry = (position, nickname, total) => ({ position, nickname, avatar: 'porcino', total });

describe('leaderboardView', () => {
  it('podio per posizione, dal 4° in poi righe; primi 10 in zona premi', () => {
    const top = [entry(1, 'Anna', 900), entry(2, 'Bea', 800), entry(3, 'Ciro', 700), ...Array.from({ length: 12 }, (_, i) => entry(4 + i, `G${i}`, 600 - i))];
    const view = leaderboardView(top, null);
    expect(view.podium[1].map((e) => e.nickname)).toEqual(['Anna']);
    expect(view.podium[2].map((e) => e.nickname)).toEqual(['Bea']);
    expect(view.podium[3].map((e) => e.nickname)).toEqual(['Ciro']);
    expect(view.rows).toHaveLength(12);
    expect(view.rows.filter((r) => r.prize).map((r) => r.position)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(view.meOutside).toBe(null);
  });

  it('pari merito: stessi punti, stessa posizione e stesso gradino', () => {
    const top = [entry(1, 'Anna', 900), entry(1, 'Bea', 900), entry(3, 'Ciro', 700), entry(3, 'Dino', 700), entry(5, 'Ezio', 600)];
    const view = leaderboardView(top, null);
    expect(view.podium[1]).toHaveLength(2);
    expect(view.podium[2]).toHaveLength(0);
    expect(view.podium[3]).toHaveLength(2);
    expect(view.rows.map((r) => r.position)).toEqual([5]);
  });

  it('io nei primi 20: evidenziato nella lista, nessuna riga a parte', () => {
    const top = [entry(1, 'Anna', 900), entry(4, 'Io', 500)];
    const view = leaderboardView(top, { nickname: 'io', position: 4, total: 500, avatar: 'porcino' });
    expect(view.rows[0].isMe).toBe(true);
    expect(view.meOutside).toBe(null);
  });

  it('io sul podio: evidenziato sul podio', () => {
    const view = leaderboardView([entry(1, 'Io', 900)], { nickname: 'Io', position: 1, total: 900, avatar: 'porcino' });
    expect(view.podium[1][0].isMe).toBe(true);
  });

  it('io fuori dai primi 20: riga a parte evidenziata', () => {
    const top = Array.from({ length: 20 }, (_, i) => entry(i + 1, `G${i}`, 1000 - i));
    const view = leaderboardView(top, { nickname: 'Io', position: 57, total: 120, avatar: 'porcino' });
    expect(view.meOutside).toMatchObject({ position: 57, isMe: true, prize: false });
  });

  it('io senza punti: nessuna riga', () => {
    const view = leaderboardView([entry(1, 'Anna', 900)], { nickname: 'Io', position: null, total: 0, avatar: 'porcino' });
    expect(view.meOutside).toBe(null);
  });
});

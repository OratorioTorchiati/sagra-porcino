import { describe, it, expect } from 'vitest';
import { eventStatus, groupByDay, sortEvents, timeLabel, dayLabel, shortDayLabel, eventsAt } from './events-data.js';

const ev = (id, day, start, end = null, point = null) => ({ id, day, start, end, title: `E${id}`, description: null, point });

describe('calendario eventi (D145)', () => {
  it('ordine cronologico: giorno, ora, poi il primo creato', () => {
    const list = [ev(3, '2026-08-15', '21:00'), ev(1, '2026-08-14', '22:00'), ev(2, '2026-08-15', '18:30'), ev(4, '2026-08-15', '18:30')];
    expect(sortEvents(list).map((e) => e.id)).toEqual([1, 2, 4, 3]);
  });

  it('raggruppa per giorno', () => {
    const groups = groupByDay([ev(1, '2026-08-15', '21:00'), ev(2, '2026-08-14', '20:00'), ev(3, '2026-08-15', '18:00')]);
    expect(groups.map((g) => [g.day, g.events.map((e) => e.id)])).toEqual([
      ['2026-08-14', [2]],
      ['2026-08-15', [3, 1]],
    ]);
  });

  it('stato: prima, durante e dopo', () => {
    const e = ev(1, '2026-08-15', '21:00', '23:00');
    expect(eventStatus(e, new Date('2026-08-15T20:59:00'))).toBe('future');
    expect(eventStatus(e, new Date('2026-08-15T22:00:00'))).toBe('live');
    expect(eventStatus(e, new Date('2026-08-15T23:00:00'))).toBe('past');
  });

  it('fine prima dell\'inizio: finisce il giorno dopo', () => {
    const e = ev(1, '2026-08-15', '22:00', '01:00');
    expect(eventStatus(e, new Date('2026-08-16T00:30:00'))).toBe('live');
    expect(eventStatus(e, new Date('2026-08-16T01:00:00'))).toBe('past');
  });

  it('senza fine: "in corso" per un\'ora', () => {
    const e = ev(1, '2026-08-15', '21:00');
    expect(eventStatus(e, new Date('2026-08-15T21:59:00'))).toBe('live');
    expect(eventStatus(e, new Date('2026-08-15T22:00:00'))).toBe('past');
  });

  it('testi: orario, giorno lungo e corto', () => {
    expect(timeLabel(ev(1, '2026-08-15', '21:00'))).toBe('21:00');
    expect(timeLabel(ev(1, '2026-08-15', '21:00', '23:30'))).toBe('21:00–23:30');
    expect(dayLabel('2026-08-15')).toBe('Sabato 15 agosto');
    expect(shortDayLabel('2026-08-15')).toBe('Sab 15 ago');
  });

  it('eventi di un punto della mappa, in ordine', () => {
    const list = [ev(1, '2026-08-15', '21:00', null, 7), ev(2, '2026-08-14', '21:00', null, 7), ev(3, '2026-08-14', '20:00', null, 8)];
    expect(eventsAt(7, list).map((e) => e.id)).toEqual([2, 1]);
  });
});

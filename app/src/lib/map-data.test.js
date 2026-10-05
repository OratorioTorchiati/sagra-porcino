import { describe, it, expect } from 'vitest';
import { latLngToXY, distanceM, directionsLinks } from './map-data.js';

describe('posizione sulla mappa (D142)', () => {
  const bounds = { south: 40.8, west: 14.7, north: 40.84, east: 14.8 };

  it('è il calcolo inverso di quello del server (041): x 0,25 / y 0,75 ↔ 40.8100023, 14.725', () => {
    const { x, y } = latLngToXY(bounds, 40.8100023, 14.725);
    expect(x).toBeCloseTo(0.25, 6);
    expect(y).toBeCloseTo(0.75, 5);
  });

  it('fuori dalla mappa: x o y fuori da 0–1', () => {
    expect(latLngToXY(bounds, 41, 14.75).y).toBeLessThan(0);
    expect(latLngToXY(bounds, 40.82, 15).x).toBeGreaterThan(1);
  });

  it('distanza: 0,01° di latitudine ≈ 1,1 km', () => {
    expect(distanceM({ lat: 40.8, lng: 14.7 }, { lat: 40.81, lng: 14.7 })).toBeCloseTo(1112, -1);
  });

  it('"Apri con…": indicazioni a piedi e coordinate da copiare', () => {
    const l = directionsLinks({ lat: 40.81, lng: 14.79, title: 'Cassa' });
    expect(l.google).toContain('travelmode=walking');
    expect(l.apple).toContain('dirflg=w');
    expect(l.coords).toBe('40.81, 14.79');
  });
});

// Arbitre côté serveur : vérifie les flottes et résout les tirs.
// Indépendant de src/engine.js car chaque partie a sa propre taille de grille.
import { FLEET } from '../../src/engine.js';

export const SIZES = [8, 10, 12];

export function shipCells(s) {
  return Array.from({ length: s.len }, (_, i) => (s.h ? [s.r, s.c + i] : [s.r + i, s.c]));
}

// Renvoie la flotte nettoyée, ou null si elle est invalide (navire manquant, hors grille, chevauchement).
export function validateFleet(ships, size) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return null;
  const taken = new Set();
  const out = [];
  for (const f of FLEET) {
    const s = ships.find(x => x && x.id === f.id);
    if (!s || !Number.isInteger(s.r) || !Number.isInteger(s.c)) return null;
    const ship = { id: f.id, name: f.name, len: f.len, r: s.r, c: s.c, h: !!s.h, rev: !!s.rev, hits: 0 };
    for (const [r, c] of shipCells(ship)) {
      if (r < 0 || c < 0 || r >= size || c >= size) return null;
      const k = r * size + c;
      if (taken.has(k)) return null;
      taken.add(k);
    }
    out.push(ship);
  }
  return out;
}

// Tir sur une flotte : shots[i] vaut 0 (inconnu), 1 (eau) ou 2 (touché).
export function fire(ships, shots, size, r, c) {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= size || c >= size) return { result: 'invalid' };
  const i = r * size + c;
  if (shots[i]) return { result: 'repeat' };
  const ship = ships.find(s => shipCells(s).some(([a, b]) => a === r && b === c));
  if (!ship) { shots[i] = 1; return { result: 'miss', r, c }; }
  shots[i] = 2;
  ship.hits++;
  if (ship.hits >= ship.len) {
    return { result: 'sunk', r, c, ship: { id: ship.id, name: ship.name, len: ship.len, r: ship.r, c: ship.c, h: ship.h, rev: ship.rev },
             fleetDestroyed: ships.every(s => s.hits >= s.len) };
  }
  return { result: 'hit', r, c, ship: { id: ship.id, name: ship.name } };
}

// Alertes partagées par tous les jeux : bandeau en haut de l'écran, vibration, carillon.
const $ = id => document.getElementById(id);
let toastTimer = null, toastKey = null;

export function showToast({ key, kind, title, text = '', actions = [], ms = 0 }) {
  clearTimeout(toastTimer); toastKey = key;
  const t = $('toast');
  t.className = 'toast plate ' + kind;
  $('toastTitle').textContent = title; $('toastText').textContent = text;
  const box = $('toastActions'); box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn' + (a.primary ? ' primary' : ''); b.textContent = a.label;
    b.addEventListener('click', () => { hideToast(); a.fn(); });
    box.appendChild(b);
  }
  t.hidden = true; void t.offsetWidth; t.hidden = false; // relance l'animation d'entrée
  if (ms) toastTimer = setTimeout(() => hideToast(key), ms);
}
export function hideToast(key) {
  if (key && key !== toastKey) return;
  clearTimeout(toastTimer); toastKey = null;
  $('toast').hidden = true;
}
export const toastKeyNow = () => toastKey;
export const buzz = p => { try { navigator.vibrate?.(p); } catch {} };
$('toastClose').addEventListener('click', () => hideToast());

let audioCtx = null;
export function alertRematch() {
  buzz([140, 90, 140, 90, 220]);
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t = t0 + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.5);
    });
  } catch {}
}

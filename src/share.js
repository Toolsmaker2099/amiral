// Inviter un adversaire : afficher un QR code, scanner un QR code, copier le code, envoyer le lien.
import qrcode from './vendor/qrcode.js';
import { CODE_RE, normalizeCode } from './online.js';

const $ = id => document.getElementById(id);

export function openQr(code, url) {
  const q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  $('qrBox').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code de la partie ' + code });
  $('qrCodeText').textContent = code;
  $('qrScreen').hidden = false;
}
export const closeQr = () => { $('qrScreen').hidden = true; };

let scan = null;
const scanMsg = t => { $('scanMsg').textContent = t; };
// Lit le code (et le jeu) dans un lien d'invitation ou un code tapé à la main.
function parseScan(text) {
  try {
    const u = new URL(text), c = normalizeCode(u.searchParams.get('partie'));
    if (CODE_RE.test(c)) return { code: c, game: u.searchParams.get('jeu') || 'amiral' };
  } catch {}
  const c = normalizeCode(text);
  return CODE_RE.test(c) ? { code: c, game: null } : null;
}
function loadJsQR() {
  if (self.jsQR) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'src/vendor/jsQR.js'; s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
}
// `game` : le jeu en cours ; un QR code destiné à un autre jeu est refusé.
export async function openScanner(onCode, game) {
  closeScanner();
  $('scanScreen').hidden = false;
  scanMsg('Visez le QR code affiché par votre adversaire.');
  if (!navigator.mediaDevices?.getUserMedia) { scanMsg('Ce navigateur ne donne pas accès à la caméra. Tapez le code à la place.'); return; }
  const session = scan = { stopped: false, stream: null, timer: null };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (session.stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    session.stream = stream;
    const video = $('scanVideo');
    video.srcObject = stream;
    await video.play();
    let detect;
    const native = 'BarcodeDetector' in self && (await BarcodeDetector.getSupportedFormats?.().catch(() => []))?.includes('qr_code');
    if (native) {
      const bd = new BarcodeDetector({ formats: ['qr_code'] });
      detect = async () => (await bd.detect(video))[0]?.rawValue || null;
    } else {
      await loadJsQR();
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w) return null;
        const k = Math.min(1, 640 / Math.max(w, h));
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cx.drawImage(video, 0, 0, cv.width, cv.height);
        return self.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data || null;
      };
    }
    const loop = async () => {
      if (session.stopped) return;
      let text = null;
      try { text = await detect(); } catch {}
      const found = text && parseScan(text);
      if (found && (!found.game || found.game === game)) { closeScanner(); onCode(found.code); return; }
      if (found) scanMsg('Ce QR code est celui d\'un autre jeu.');
      else if (text) scanMsg('Ce QR code ne correspond pas à une partie de Playbox.');
      session.timer = setTimeout(loop, 150);
    };
    loop();
  } catch (e) {
    if (session.stopped) return;
    scanMsg(e && e.name === 'NotAllowedError'
      ? 'L\'accès à la caméra a été refusé. Autorisez-le dans les réglages du navigateur, ou tapez le code.'
      : 'Impossible d\'ouvrir la caméra. Tapez le code à la place.');
  }
}
export function closeScanner() {
  if (scan) {
    scan.stopped = true; clearTimeout(scan.timer);
    scan.stream?.getTracks().forEach(t => t.stop());
    scan = null;
  }
  $('scanVideo').srcObject = null;
  $('scanScreen').hidden = true;
}

function selectText(el) { const sel = getSelection(), r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r); }

export async function copyCode(btn, code, codeEl) {
  try { await navigator.clipboard.writeText(code); btn.textContent = 'Code copié'; }
  catch { selectText(codeEl); btn.textContent = 'Code sélectionné'; }
  btn.classList.add('done');
  setTimeout(() => { btn.textContent = 'Copier le code'; btn.classList.remove('done'); }, 2000);
}

export async function shareInvite(btn, code, url, gameName, codeEl) {
  const text = `Rejoins-moi sur ${gameName}, dans Playbox. Code de la partie : ${code}`;
  if (navigator.share) { try { await navigator.share({ title: gameName, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); btn.textContent = 'Lien copié'; }
  catch { selectText(codeEl); btn.textContent = 'Code sélectionné'; }
  setTimeout(() => { btn.textContent = 'Envoyer le lien'; }, 2200);
}

$('qrClose').addEventListener('click', closeQr);
$('scanClose').addEventListener('click', closeScanner);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('qrScreen').hidden) closeQr();
  if (!$('scanScreen').hidden) closeScanner();
});

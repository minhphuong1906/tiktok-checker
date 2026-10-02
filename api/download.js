import { Readable } from 'node:stream';

// Proxy tải file để trình duyệt lưu về máy thay vì phát. Chỉ cho phép host TikTok/tikwm.
const ALLOWED = /(^|\.)(tikwm\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokv\.com|tiktokv\.us|byteoversea\.com|ibytedtos\.com)$/i;

export default async function handler(req, res) {
  let target;
  try { target = new URL(String(req.query.u || '')); } catch { return res.status(400).end('Bad url'); }
  if (target.protocol !== 'https:' || !ALLOWED.test(target.hostname)) return res.status(400).end('Host not allowed');

  const name = String(req.query.name || 'tiktok').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const ext = req.query.type === 'mp3' ? 'mp3' : req.query.type === 'jpg' ? 'jpg' : 'mp4';
  const mime = { mp3: 'audio/mpeg', jpg: 'image/jpeg', mp4: 'video/mp4' }[ext];
  try {
    const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.tiktok.com/' } });
    if (!r.ok || !r.body) return res.status(502).end('Upstream error');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${name}.${ext}"`);
    Readable.fromWeb(r.body).pipe(res);
  } catch {
    res.status(502).end('Download failed');
  }
}

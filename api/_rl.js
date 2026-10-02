// Giới hạn lượt gọi theo IP (lưu trong bộ nhớ từng instance, đủ để chặn spam cơ bản).
const hits = new Map();
export function limited(req, max = 30, windowMs = 60_000) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) { hits.set(ip, { n: 1, reset: now + windowMs }); }
  else if (++rec.n > max) return true;
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  return false;
}

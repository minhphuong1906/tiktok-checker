import { limited } from './_rl.js';

// Lấy thông tin video TikTok từ link. Chạy phía server nên không dính CORS.
export default async function handler(req, res) {
  if (limited(req)) return res.status(429).json({ error: 'Bạn thao tác quá nhanh, thử lại sau ít giây.' });
  const url = String(req.query.url || '').trim();
  if (!/^https?:\/\/([\w-]+\.)*tiktok\.com\//i.test(url)) {
    return res.status(400).json({ error: 'Link TikTok không hợp lệ. Hãy dán link dạng tiktok.com/@user/video/…' });
  }
  try {
    const r = await fetch('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const j = await r.json();
    if (j.code !== 0 || !j.data) {
      return res.status(404).json({ error: 'Không tìm thấy video. Video có thể bị xoá hoặc để riêng tư.' });
    }
    const d = j.data;
    const abs = (u) => (u && u.startsWith('/') ? 'https://www.tikwm.com' + u : u);
    res.setHeader('Cache-Control', 's-maxage=300');
    res.json({
      id: d.id,
      title: d.title || '',
      cover: abs(d.cover),
      play: abs(d.play),
      hdplay: abs(d.hdplay),
      music: abs(d.music),
      duration: d.duration,
      created: d.create_time,
      author: { name: d.author?.nickname, id: d.author?.unique_id, avatar: abs(d.author?.avatar) },
      stats: {
        views: d.play_count, likes: d.digg_count, comments: d.comment_count,
        shares: d.share_count, saves: d.collect_count,
      },
    });
  } catch (e) {
    res.status(502).json({ error: 'Dịch vụ lấy dữ liệu đang bận. Thử lại sau ít phút.' });
  }
}

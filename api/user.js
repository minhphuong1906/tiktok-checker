import { limited } from './_rl.js';

// Tra cứu tài khoản TikTok: ?username=…&section=info|posts|followers|following|story|repost&cursor=…
const TW = 'https://www.tikwm.com/api';
const abs = (u) => (u && u.startsWith('/') ? 'https://www.tikwm.com' + u : u);

async function tw(path, params) {
  const r = await fetch(TW + path + '?' + new URLSearchParams(params), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  return r.json();
}

// Story / Repost: cần nguồn dữ liệu riêng (ở đây dùng Apify). Cấu hình bằng biến môi trường trên Vercel.
async function apify(actor, username) {
  const r = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, usernames: [username] }) }
  );
  if (!r.ok) throw new Error('apify ' + r.status);
  return r.json();
}
const normItem = (i) => ({
  id: i.id || i.video_id || '',
  title: i.title || i.desc || '',
  cover: abs(i.cover || i.cover_url || i.thumbnail || ''),
  play: abs(i.video_url || i.play || i.video || i.hdplay || ''),
  stats: { views: i.play_count, likes: i.digg_count, comments: i.comment_count },
});

export default async function handler(req, res) {
  if (req.query.section === 'config') {
    res.setHeader('Cache-Control', 's-maxage=300');
    const t = !!process.env.APIFY_TOKEN;
    return res.json({ story: t && !!process.env.STORY_ACTOR, repost: t && !!process.env.REPOST_ACTOR });
  }
  if (limited(req)) return res.status(429).json({ error: 'Bạn thao tác quá nhanh, thử lại sau ít giây.' });
  const username = String(req.query.username || '').trim().replace(/^@/, '');
  const section = String(req.query.section || 'info');
  const cursor = String(req.query.cursor || '0');
  if (!/^[\w.]{2,40}$/.test(username)) return res.status(400).json({ error: 'Username không hợp lệ.' });

  const fail = (code, error) => res.status(code).json({ error });
  const limited = (j) => /limit/i.test(j?.msg || '');
  try {
    if (section === 'story' || section === 'repost') {
      const actor = section === 'story' ? process.env.STORY_ACTOR : process.env.REPOST_ACTOR;
      if (!process.env.APIFY_TOKEN || !actor) {
        return fail(501, `Mục này chưa được cấu hình nguồn dữ liệu (cần APIFY_TOKEN và ${section === 'story' ? 'STORY_ACTOR' : 'REPOST_ACTOR'}).`);
      }
      const items = await apify(actor, username);
      return res.json({ items: (items || []).map(normItem), hasMore: false });
    }

    const info = await tw('/user/info', { unique_id: username });
    if (info.code !== 0) return limited(info) ? fail(429, 'Đang bị giới hạn tốc độ, thử lại sau 1 giây.') : fail(404, 'Không tìm thấy tài khoản này.');
    const u = info.data.user, s = info.data.stats || {};
    const profile = {
      id: u.id, username: u.uniqueId, name: u.nickname, avatar: abs(u.avatarLarger || u.avatarMedium || u.avatarThumb),
      bio: u.signature || '', verified: !!u.verified, private: !!u.privateAccount,
      stats: { followers: s.followerCount, following: s.followingCount, likes: s.heartCount, videos: s.videoCount },
    };
    res.setHeader('Cache-Control', 's-maxage=120');
    if (section === 'info') return res.json({ profile });
    if (profile.private) return fail(403, 'Tài khoản riêng tư, không xem được mục này.');

    res.setHeader('Cache-Control', 's-maxage=120');
    if (section === 'posts') {
      const j = await tw('/user/posts', { unique_id: username, count: 12, cursor });
      if (j.code !== 0) return limited(j) ? fail(429, 'Đang bị giới hạn tốc độ.') : fail(502, 'Không lấy được danh sách video.');
      const items = (j.data.videos || []).map((v) => ({
        id: v.video_id || v.id, title: v.title || '', cover: abs(v.cover), play: abs(v.play),
        stats: { views: v.play_count, likes: v.digg_count, comments: v.comment_count },
      }));
      return res.json({ items, hasMore: !!j.data.hasMore, cursor: String(j.data.cursor || '') });
    }
    if (section === 'followers' || section === 'following') {
      const j = await tw('/user/' + section, { user_id: u.id, count: 30, time: cursor });
      if (j.code !== 0) return limited(j) ? fail(429, 'Đang bị giới hạn tốc độ.') : fail(502, 'Không lấy được danh sách. Chủ tài khoản có thể đã ẩn.');
      const list = j.data.followers || j.data.followings || [];
      const users = list.map((x) => ({
        id: x.unique_id || x.uniqueId, name: x.nickname, avatar: abs(x.avatar || x.avatarThumb), followers: x.follower_count ?? x.followerCount,
      }));
      return res.json({ users, hasMore: !!j.data.hasMore, cursor: String(j.data.time || '') });
    }
    return fail(400, 'Mục không hợp lệ.');
  } catch (e) {
    return fail(502, 'Nguồn dữ liệu tạm thời không phản hồi.');
  }
}

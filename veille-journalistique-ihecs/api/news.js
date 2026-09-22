const SOURCES = [
  { name: 'RTBF', url: 'https://rss.rtbf.be/article/rss/rtbfinfo_homepage.xml', direct: true },
  { name: 'RTL info', query: 'site:rtl.be/actu' },
  { name: 'La Libre', query: 'site:lalibre.be' },
  { name: 'Le Soir', query: 'site:lesoir.be' },
  { name: 'BX1', query: 'site:bx1.be' },
  { name: 'La DH', query: 'site:dhnet.be' },
  { name: 'Le Vif', query: 'site:levif.be' },
];

const decode = (value = '') => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const strip = (value = '') => decode(value)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
};

const attr = (xml, tagName, attrName) => {
  const m = xml.match(new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'i'));
  return m ? decode(m[1]) : '';
};

function categoryFor(text = '') {
  const t = text.toLowerCase();
  if (/gouvernement|ministre|parlement|élection|parti|coalition|politique|président|premier ministre|député|sénat|commission européenne/.test(t)) return 'Politique';
  if (/guerre|ukraine|gaza|israël|otan|onu|diplomat|international|chine|états-unis|russie|iran|europe/.test(t)) return 'International';
  if (/euro|budget|inflation|banque|entreprise|emploi|économie|marché|prix|salaire|finance|bourse/.test(t)) return 'Économie';
  if (/football|sport|cyclisme|tennis|formule 1|match|championnat|diables rouges/.test(t)) return 'Sport';
  if (/cinéma|musique|culture|festival|livre|art|concert|série/.test(t)) return 'Culture';
  if (/science|climat|environnement|santé|espace|technologie|ia |intelligence artificielle/.test(t)) return 'Sciences';
  return 'Belgique / Société';
}

function parseFeed(xml, fallbackSource) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map((item, index) => {
    let title = strip(tag(item, 'title'));
    let source = strip(tag(item, 'source')) || fallbackSource;
    if (!tag(item, 'source') && title.includes(' - ')) {
      const parts = title.split(' - ');
      const maybeSource = parts[parts.length - 1].trim();
      if (maybeSource.length < 40) {
        source = maybeSource;
        title = parts.slice(0, -1).join(' - ').trim();
      }
    }
    const description = strip(tag(item, 'description') || tag(item, 'content:encoded'));
    const pubDateRaw = tag(item, 'pubDate') || tag(item, 'dc:date');
    const date = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const enclosure = attr(item, 'enclosure', 'url') || attr(item, 'media:content', 'url') || attr(item, 'media:thumbnail', 'url');
    return {
      id: `${fallbackSource}-${date.getTime()}-${index}-${title.slice(0, 20)}`,
      title,
      source,
      url: strip(tag(item, 'link')),
      description: description.slice(0, 520),
      image: enclosure,
      date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      category: categoryFor(`${title} ${description}`),
    };
  }).filter(x => x.title && x.url);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'VeilleIHECS/1.0 (+educational news dashboard)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  const requested = String(req.query?.days || '90');
  const days = Math.max(1, Math.min(180, Number(requested) || 90));
  const since = Date.now() - days * 86400000;

  const jobs = SOURCES.map(async (source) => {
    try {
      const url = source.direct
        ? source.url
        : `https://news.google.com/rss/search?q=${encodeURIComponent(`${source.query} when:${days}d`)}&hl=fr&gl=BE&ceid=BE:fr`;
      const xml = await fetchText(url);
      return { source: source.name, ok: true, items: parseFeed(xml, source.name) };
    } catch (error) {
      return { source: source.name, ok: false, error: error.message, items: [] };
    }
  });

  const results = await Promise.all(jobs);
  const all = results.flatMap(r => r.items)
    .filter(x => new Date(x.date).getTime() >= since)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const seen = new Set();
  const items = all.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, ' ').trim().slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 160);

  res.status(200).json({
    generatedAt: new Date().toISOString(),
    days,
    items,
    sources: results.map(r => ({ name: r.source, ok: r.ok, error: r.error || null, count: r.items.length })),
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { url } = req.body || {}
  if (!url) return res.status(400).json({ error: 'URL required' })

  try {
    const videoId = await resolveVideoId(url)
    const item = await fetchVideoData(videoId)
    const { text, source } = await extractText(item)
    return res.json({ success: true, text, source, title: item.desc })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || '解析失败' })
  }
}

async function resolveVideoId(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    },
  })
  const finalUrl = response.url

  const match = finalUrl.match(/video\/(\d+)/)
  if (match) return match[1]

  // 有些短链格式不同，从原始 URL 里找
  const match2 = url.match(/\/(\d{15,})/)
  if (match2) return match2[1]

  throw new Error('无法解析视频ID，请确认链接是否正确')
}

async function fetchVideoData(videoId: string) {
  const response = await fetch(
    `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.douyin.com/',
        'Accept': 'application/json',
      },
    }
  )
  const data = await response.json()
  const item = data?.item_list?.[0]
  if (!item) throw new Error('视频数据获取失败，可能需要登录')
  return item
}

async function extractText(item: any): Promise<{ text: string; source: string }> {
  // 1. 优先尝试字幕
  const subtitleInfos =
    item.video?.subtitles ||
    item.subtitle_infos ||
    []

  for (const sub of subtitleInfos) {
    const subtitleUrl = sub.url?.url_list?.[0] || sub.Url || sub.url
    if (!subtitleUrl) continue
    try {
      const srtRes = await fetch(subtitleUrl)
      const srtText = await srtRes.text()
      const parsed = parseSRT(srtText)
      if (parsed.length > 20) return { text: parsed, source: 'subtitle' }
    } catch {}
  }

  // 2. 降级到视频描述
  if (item.desc && item.desc.length > 5) {
    return { text: item.desc, source: 'desc' }
  }

  throw new Error('该视频没有字幕也没有文字描述，请手动输入菜名')
}

function parseSRT(srt: string): string {
  return srt
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      if (/^\d+$/.test(t)) return false           // 序号行
      if (/\d{2}:\d{2}:\d{2}/.test(t)) return false  // 时间戳行
      return true
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

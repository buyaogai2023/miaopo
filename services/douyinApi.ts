const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

export interface DouyinResult {
  text: string
  source: 'subtitle' | 'desc'
}

export async function extractDouyinText(url: string): Promise<DouyinResult> {
  // Step 1: 跟随短链跳转，拿到 video_id
  const videoId = await resolveVideoId(url)

  // Step 2: 拿视频元数据（字幕 + 描述）
  const item = await fetchVideoData(videoId)

  // Step 3: 提取文字
  return extractText(item)
}

async function resolveVideoId(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA },
  })
  const finalUrl = response.url

  const match = finalUrl.match(/video\/(\d+)/)
  if (match) return match[1]

  const match2 = url.match(/\/(\d{15,})/)
  if (match2) return match2[1]

  throw new Error('无法解析视频ID，请确认链接是否正确')
}

async function fetchVideoData(videoId: string) {
  const response = await fetch(
    `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`,
    {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.douyin.com/',
        'Accept': 'application/json',
      },
    }
  )
  const data = await response.json()
  const item = data?.item_list?.[0]
  if (!item) throw new Error('视频数据获取失败')
  return item
}

function extractText(item: any): DouyinResult {
  // 1. 优先字幕
  const subtitleInfos = item.video?.subtitles || item.subtitle_infos || []
  // 字幕需要异步下载，这里先返回字幕URL标记，由调用方处理
  // 简化版：直接用描述文字 + 字幕URL列表返回
  if (subtitleInfos.length > 0) {
    const subtitleUrl = subtitleInfos[0]?.url?.url_list?.[0] || subtitleInfos[0]?.Url
    if (subtitleUrl) {
      return { text: subtitleUrl, source: 'subtitle' }
    }
  }

  // 2. 降级到视频描述
  if (item.desc && item.desc.trim().length > 5) {
    return { text: item.desc, source: 'desc' }
  }

  throw new Error('该视频没有文字内容，请手动输入菜名')
}

export async function downloadSubtitle(url: string): Promise<string> {
  const res = await fetch(url)
  const srt = await res.text()
  return parseSRT(srt)
}

function parseSRT(srt: string): string {
  return srt
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      if (/^\d+$/.test(t)) return false
      if (/\d{2}:\d{2}:\d{2}/.test(t)) return false
      return true
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

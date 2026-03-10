const TIKHUB_KEY = '1ak1Iv46zVeRw2vLI4OGxDL6DRaEUJlT5DvToRnbR8TikhGzDU+PKzuzbA=='
const TIKHUB_BASE = 'https://api.tikhub.dev'
const DASHSCOPE_KEY = 'sk-9e9c16fa845349f98214e473b5148f96'
const ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'

export interface DouyinResult {
  text: string
  source: 'asr' | 'desc'
}

export async function extractDouyinText(url: string): Promise<DouyinResult> {
  // Step 1: TikHub 拿视频直链 + 描述
  const { videoUrl, desc } = await fetchVideoUrl(url)

  // Step 2: Paraformer 语音识别
  if (videoUrl) {
    try {
      const text = await transcribeVideo(videoUrl)
      if (text.length > 20) return { text, source: 'asr' }
    } catch {}
  }

  // Step 3: 降级到视频描述
  if (desc && desc.length > 5) return { text: desc, source: 'desc' }

  throw new Error('无法提取视频内容，请手动输入菜名')
}

async function fetchVideoUrl(url: string): Promise<{ videoUrl: string; desc: string }> {
  const res = await fetch(
    `${TIKHUB_BASE}/api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(url)}`,
    { headers: { 'Authorization': `Bearer ${TIKHUB_KEY}` } }
  )
  const data = await res.json()
  if (data.code !== 200) throw new Error('TikHub 请求失败：' + (data.message || ''))

  const item = data?.data?.aweme_detail || {}
  const videoUrl = item?.video?.play_addr?.url_list?.[0] || ''
  const desc = item?.desc || ''
  return { videoUrl, desc }
}

async function transcribeVideo(videoUrl: string): Promise<string> {
  // 提交异步任务
  const submitRes = await fetch(ASR_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_KEY}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'paraformer-v2',
      input: { file_urls: [videoUrl] },
      parameters: { language_hints: ['zh'] },
    }),
  })
  const submitData = await submitRes.json()
  const taskId = submitData?.output?.task_id
  if (!taskId) throw new Error('ASR 任务提交失败')

  // 轮询结果（最多等 60 秒）
  for (let i = 0; i < 12; i++) {
    await sleep(5000)
    const pollRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${DASHSCOPE_KEY}` },
    })
    const pollData = await pollRes.json()
    const status = pollData?.output?.task_status

    if (status === 'SUCCEEDED') {
      const transcriptUrl = pollData?.output?.results?.[0]?.transcription_url
      if (!transcriptUrl) throw new Error('找不到转录结果')
      return await downloadTranscript(transcriptUrl)
    }
    if (status === 'FAILED') throw new Error('语音识别失败')
  }
  throw new Error('语音识别超时')
}

async function downloadTranscript(url: string): Promise<string> {
  const res = await fetch(url)
  const data = await res.json()
  const texts: string[] = []
  for (const t of data?.transcripts || []) {
    for (const s of t?.sentences || []) {
      if (s.text) texts.push(s.text)
    }
  }
  return texts.join(' ').trim()
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

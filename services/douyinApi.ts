// 部署到 Vercel 后，把下面的 URL 改成你的域名
// 例如：https://miaopo.vercel.app/api/douyin
const DOUYIN_API = 'https://miaopo.vercel.app/api/douyin'

export interface DouyinResult {
  text: string
  source: 'subtitle' | 'desc'
  title: string
}

export async function extractDouyinText(url: string): Promise<DouyinResult> {
  const response = await fetch(DOUYIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.error || '抖音解析失败')
  }
  return data
}

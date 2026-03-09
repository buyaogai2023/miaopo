const API_KEY = 'sk-9e9c16fa845349f98214e473b5148f96'
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen3.5-plus-2026-02-15'

export interface Message { role: 'user' | 'assistant'; content: string }
export interface AppAction { type: string; payload: any }
export interface ChefResponse { message: string; actions: AppAction[] }

export interface AppData {
  fridge: { id: string; name: string; amount: string }[]
  shopping: { id: string; name: string; amount: string; checked: boolean; category: string }[]
  recipes: { id: string; title: string; ingredients: any[]; steps: string[]; cook_time?: number }[]
  mealPlan: { id: string; date: string; meal_type: string; recipe_title: string }[]
}

function buildMessages(messages: Message[], data: AppData, recipeCtx?: string) {
  const fridge = data.fridge.map(i => `${i.name}${i.amount}`).join('、') || '空'
  const shopping = data.shopping.filter(i => !i.checked).map(i => i.name).join('、') || '空'
  const recipes = data.recipes.map(r => r.title).join('、') || '无'
  const ctx = `你是妙妙大厨。APP数据：冰箱[${fridge}] 购物[${shopping}] 菜谱[${recipes}]${recipeCtx ? ` 当前烹饪[${recipeCtx}]` : ''}。
回复简短口语中文不超80字。需操作时末尾加 ACTIONS:{"actions":[{"type":"操作","payload":{}}]}`

  if (messages.length === 0) {
    return [{ role: 'user', content: ctx + '\n\n你好，今天想吃什么？根据我冰箱食材给建议。' }]
  }
  const history = messages.slice(-8)
  return [
    { role: 'user', content: ctx + '\n\n' + history[0].content },
    ...history.slice(1),
  ]
}

function parseResponse(raw: string): ChefResponse {
  const match = raw.match(/ACTIONS:\{"actions":\[[\s\S]*?\]\}/)
  let actions: AppAction[] = []
  let message = raw
  if (match) {
    try { actions = JSON.parse(match[0].replace('ACTIONS:', '')).actions || [] } catch {}
    message = raw.replace(match[0], '').trim()
  }
  return { message, actions }
}

// 流式版本：用 XHR onprogress 实时回调每个 token
export function chatWithChefStream(
  messages: Message[],
  data: AppData,
  recipeCtx: string | undefined,
  onDelta: (delta: string) => void,
): Promise<ChefResponse> {
  const apiMessages = buildMessages(messages, data, recipeCtx)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', API_URL)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('Authorization', `Bearer ${API_KEY}`)

    let offset = 0
    let full = ''

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(offset)
      offset = xhr.responseText.length
      for (const line of newText.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6)
        if (payload === '[DONE]') continue
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content || ''
          if (delta) { full += delta; onDelta(delta) }
        } catch {}
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 400) { reject(new Error(`HTTP ${xhr.status}`)); return }
      resolve(parseResponse(full))
    }

    xhr.onerror = () => reject(new Error('XHR failed'))

    xhr.send(JSON.stringify({
      model: MODEL,
      messages: apiMessages,
      max_tokens: 250,
      enable_thinking: false,
      stream: true,
    }))
  })
}

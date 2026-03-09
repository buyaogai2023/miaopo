const API_KEY = 'sk-9e9c16fa845349f98214e473b5148f96'
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen3.5-plus-2026-02-15'

async function callAI(messages: { role: string; content: any }[]) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, enable_thinking: false }),
  })
  const data = await response.json()
  const content = data.choices[0].message.content
  const match = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON found')
  return JSON.parse(match[0])
}

async function callAIText(messages: { role: string; content: any }[]): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, enable_thinking: false }),
  })
  const data = await response.json()
  return data.choices[0].message.content?.trim() || ''
}

export async function askCookingChef(
  recipeTitle: string,
  ingredients: { name: string; amount: string }[],
  steps: string[],
  currentStep: number,
  question: string,
  history: { role: string; content: string }[] = []
): Promise<string> {
  const ingStr = ingredients.map(i => `${i.name}${i.amount}`).join('、')
  const stepsStr = steps.map((s, i) => `第${i + 1}步：${s}`).join('\n')
  const systemMsg = {
    role: 'system',
    content: `你是专业厨师，正在陪用户做「${recipeTitle}」。
食材：${ingStr}
步骤：\n${stepsStr}
当前进度：第${currentStep + 1}步（共${steps.length}步）：${steps[currentStep]}
回答要求：口语化、简短（不超过40字）、像站在旁边的朋友。遇到紧急情况用更短指令。`,
  }
  const messages = [
    systemMsg,
    ...history.slice(-6),
    { role: 'user', content: question },
  ]
  return await callAIText(messages)
}

export async function extractRecipeFromText(text: string) {
  const result = await callAI([{
    role: 'user',
    content: `请从以下内容中提取菜谱信息，只输出一个JSON对象，不要任何其他文字。
JSON格式：{"title":"菜名","ingredients":[{"name":"食材名","amount":"用量"}],"steps":["步骤1","步骤2"],"cook_time":30,"servings":2}
内容：${text}`,
  }])

  if (!result.ingredients?.length || !result.steps?.length) {
    throw new Error('NO_RECIPE_FOUND')
  }
  return result
}

export async function generateRecipeByName(name: string) {
  return await callAI([{
    role: 'user',
    content: `请为"${name}"生成一个详细的家常菜谱，只输出一个JSON对象，不要任何其他文字。
JSON格式：{"title":"菜名","ingredients":[{"name":"食材名","amount":"用量"}],"steps":["步骤1","步骤2"],"cook_time":30,"servings":2}`,
  }])
}

export async function recognizeFridgeItems(base64Image: string) {
  return await callAI([{
    role: 'user',
    content: [
      {
        type: 'text',
        text: '请识别图片中的食材，只输出JSON数组，格式：[{"name":"食材名","amount":"估计数量"}]，不要其他文字。',
      },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64Image}` },
      },
    ],
  }])
}

export async function suggestRecipesByIngredients(ingredients: string[], tastes: string[] = [], history: string[] = []) {
  const tasteStr = tastes.length ? `口味偏好：${tastes.join('、')}。` : ''
  const historyStr = history.length ? `最近吃过：${history.slice(0, 5).join('、')}，尽量不重复。` : ''
  return await callAI([{
    role: 'user',
    content: `我冰箱里有：${ingredients.join('、')}。${tasteStr}${historyStr}
请个性化推荐5个适合的菜，只输出JSON数组，格式：[{"title":"菜名","reason":"推荐理由（结合口味偏好说明）","missing":["缺少的食材"],"match_score":85}]，不要其他文字。`,
  }])
}

export async function analyzeNutrition(title: string, ingredients: { name: string; amount: string }[]): Promise<{
  calories: number; protein: number; fat: number; carbs: number; score: number; tags: string[]; tips: string
}> {
  const ingStr = ingredients.slice(0, 8).map(i => `${i.name}${i.amount}`).join('、')
  return await callAI([{
    role: 'user',
    content: `估算"${title}"每人份营养(食材:${ingStr})，只输JSON:{"calories":0,"protein":0,"fat":0,"carbs":0,"score":0,"tags":[],"tips":""}`,
  }])
}

export async function analyzeMealPhoto(base64Image: string): Promise<{
  foods: { name: string; portion: string; calories: number; protein: number; fat: number; carbs: number }[]
  total: { calories: number; protein: number; fat: number; carbs: number }
  summary: string
}> {
  return await callAI([{
    role: 'user',
    content: [
      { type: 'text', text: '识别这顿饭里的食物和估算营养，只输JSON:{"foods":[{"name":"","portion":"","calories":0,"protein":0,"fat":0,"carbs":0}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"summary":"一句话描述"}' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
    ],
  }])
}

export async function parseMealText(text: string): Promise<{
  foods: { name: string; portion: string; calories: number; protein: number; fat: number; carbs: number }[]
  total: { calories: number; protein: number; fat: number; carbs: number }
  summary: string
}> {
  return await callAI([{
    role: 'user',
    content: `解析这顿饭的营养:"${text}"，只输JSON:{"foods":[{"name":"","portion":"","calories":0,"protein":0,"fat":0,"carbs":0}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"summary":"一句话描述"}`,
  }])
}

export async function generateWeeklyHealthReport(
  weekLogs: { date: string; meal: string; title: string; calories: number; protein: number; fat: number; carbs: number }[],
  familyProfiles: { name: string; health?: any }[]
): Promise<{ summary: string; achievements: string[]; warnings: string[]; next_week_tips: string[] }> {
  const days = new Set(weekLogs.map(l => l.date)).size || 1
  const avgCal = Math.round(weekLogs.reduce((s, l) => s + l.calories, 0) / days)
  const avgPro = Math.round(weekLogs.reduce((s, l) => s + l.protein, 0) / days)
  const goals = familyProfiles.map(m => m.health?.goal).filter(Boolean).join('/')
  const conditions = familyProfiles.flatMap(m => m.health?.conditions || []).join('/')
  return await callAI([{
    role: 'user',
    content: `营养师分析本周:${weekLogs.length}餐,均${avgCal}千卡,蛋白${avgPro}g,目标:${goals||'健康'},健康:${conditions||'无'}。只输JSON:{"summary":"","achievements":[],"warnings":[],"next_week_tips":[]}`,
  }])
}

function getSeason(): string {
  const m = new Date().getMonth() + 1
  if (m >= 3 && m <= 5) return '春季'
  if (m >= 6 && m <= 8) return '夏季'
  if (m >= 9 && m <= 11) return '秋季'
  return '冬季'
}

export async function generateHealthyRecommendation(
  familyProfiles: { name: string; health?: any; tastes?: string[] }[],
  fridge: string[],
  liked: string[] = [],
  disliked: string[] = [],
  recentMeals: string[] = []
): Promise<{ meal: string; title: string; reason: string; nutrition_highlight: string; missing_ingredients: string[] }[]> {
  const profiles = familyProfiles.map(m => {
    const h = m.health || {}
    const parts = [m.name]
    if (h.age) parts.push(`${h.age}岁`)
    if (h.goal) parts.push(`目标:${h.goal}`)
    if (h.conditions?.length) parts.push(`健康问题:${h.conditions.join('/')}`)
    if (h.allergies?.length) parts.push(`过敏:${h.allergies.join('/')}`)
    if (m.tastes?.length) parts.push(`口味:${m.tastes.join('/')}`)
    return parts.join(' ')
  }).join('；')
  const season = getSeason()
  const fridgeStr = fridge.length ? `冰箱现有：${fridge.join('、')}。` : ''
  const likedStr = liked.length ? `口味偏好（喜欢这类风格）：${liked.join('、')}。` : ''
  const dislikedStr = disliked.length ? `不喜欢（避免）：${disliked.join('、')}。` : ''
  const recentStr = recentMeals.length ? `最近7天已吃过（不要重复）：${recentMeals.slice(0, 10).join('、')}。` : ''
  return await callAI([{
    role: 'user',
    content: `你是家庭营养师。现在是${season}。家庭成员：${profiles}。${fridgeStr}${likedStr}${dislikedStr}${recentStr}
推荐今日早中晚三餐，每餐一道菜，要求：满足所有成员健康需求、应季食材、优先用冰箱食材、不重复最近吃过的。
只输出JSON数组，格式：[{"meal":"早餐","title":"菜名","reason":"为什么适合全家","nutrition_highlight":"营养亮点","missing_ingredients":["冰箱里缺的食材"]}]
不要其他文字。`,
  }])
}

export async function generateWeeklyMealPlan(
  fridge: string[],
  tastes: string[],
  weekDates: string[]
): Promise<{ date: string; meal_type: string; recipe_title: string }[]> {
  const tasteStr = tastes.length ? `口味偏好：${tastes.join('、')}。` : ''
  const fridgeStr = fridge.length ? `冰箱现有：${fridge.join('、')}。` : ''
  return await callAI([{
    role: 'user',
    content: `你是专业营养师。${tasteStr}${fridgeStr}
请为以下日期生成一周三餐计划（早中晚各一个菜名，尽量用冰箱食材，营养均衡，不重复）。
日期：${weekDates.join('、')}
只输出JSON数组，每项格式：{"date":"YYYY-MM-DD","meal_type":"早餐|午餐|晚餐","recipe_title":"菜名"}
不要任何其他文字。`,
  }])
}

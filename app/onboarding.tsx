import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { router } from 'expo-router'
import { useFamilyStore, OnboardingData } from '../store/familyStore'
import { callAIText } from '../services/deepseek'

const STEPS = [
  {
    q: '家里几口人一起吃饭？',
    key: 'familySize',
    multi: false,
    options: ['🙋 就我一个人', '👫 两个人', '👨‍👩‍👦 三四口之家', '👨‍👩‍👧‍👦 五人以上大家庭'],
  },
  {
    q: '平时偏好哪种口味？',
    sub: '可多选，AI推荐会优先这些风格',
    key: 'tastes',
    multi: true,
    options: ['🌶️ 川湘麻辣', '🐟 粤式清淡', '🥩 东北家常', '🦐 江浙鲜甜', '🍜 西北面食', '😋 啥都行不挑'],
  },
  {
    q: '有什么不能吃的吗？',
    sub: '勾选你需要避免的，AI会自动过滤',
    key: 'dietary',
    multi: true,
    options: ['🐷 不吃猪肉', '🐄 不吃牛羊肉', '🥗 吃素', '🧂 要少盐少油', '🍬 需要控糖', '✅ 没有忌口'],
  },
  {
    q: '家里谁来掌勺？',
    key: 'cookRole',
    multi: false,
    options: ['🔰 我做，刚开始学', '👨‍🍳 我做，已经很熟练', '🔄 家人轮流做', '👶 主要给孩子做'],
  },
  {
    q: '工作日下厨，时间够多少？',
    key: 'cookTime',
    multi: false,
    options: ['⚡ 15分钟搞定，要快', '⏱️ 大概30分钟', '🍲 不着急，1小时也行', '📅 平时不做，周末才下厨'],
  },
  {
    q: '每月伙食费大概多少？',
    sub: '帮AI推荐更适合你预算的食材和菜谱',
    key: 'budget',
    multi: false,
    options: ['🌱 500元以内，精打细算', '👍 500-1000元', '🍽️ 1000-2000元', '✨ 2000元以上，品质优先'],
  },
]

export default function Onboarding() {
  const [welcome, setWelcome] = useState(true)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [loading, setLoading] = useState(false)
  const [aiProfile, setAiProfile] = useState('')
  const saveOnboarding = useFamilyStore(s => s.saveOnboarding)

  const current = STEPS[step]
  const answer = answers[current.key]
  const isMulti = current.multi

  function toggle(opt: string) {
    if (isMulti) {
      const arr = (answer as string[]) || []
      if (arr.includes(opt)) {
        setAnswers({ ...answers, [current.key]: arr.filter(x => x !== opt) })
      } else {
        setAnswers({ ...answers, [current.key]: [...arr, opt] })
      }
    } else {
      setAnswers({ ...answers, [current.key]: opt })
    }
  }

  function isSelected(opt: string) {
    if (isMulti) return ((answer as string[]) || []).includes(opt)
    return answer === opt
  }

  function canNext() {
    if (isMulti) return ((answer as string[]) || []).length > 0
    return !!answer
  }

  async function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      // 最后一步：调AI生成画像
      setLoading(true)
      try {
        const profile = await generateAIProfile(answers)
        setAiProfile(profile)
      } catch {
        Alert.alert('提示', '网络异常，使用默认配置')
        await finishOnboarding('根据您的偏好，已为您配置个性化推荐。')
      } finally {
        setLoading(false)
      }
    }
  }

  async function finishOnboarding(profile: string) {
    const data: OnboardingData = {
      familySize: answers['familySize'] as string,
      tastes: answers['tastes'] as string[] || [],
      dietary: answers['dietary'] as string[] || [],
      cookRole: answers['cookRole'] as string,
      cookTime: answers['cookTime'] as string,
      budget: answers['budget'] as string,
      aiProfile: profile,
      completed: true,
    }
    await saveOnboarding(data)
    router.replace('/(tabs)')
  }

  // AI画像结果页
  if (aiProfile) {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <Text style={styles.resultEmoji}>🎉</Text>
          <Text style={styles.resultTitle}>你的家庭饮食画像</Text>
          <Text style={styles.resultText}>{aiProfile}</Text>
        </View>
        <Text style={styles.resultHint}>妙谱已根据你的偏好完成配置，AI推荐将更适合你家~</Text>
        <TouchableOpacity style={styles.startBtn} onPress={() => finishOnboarding(aiProfile)}>
          <Text style={styles.startBtnText}>开始使用妙谱 →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // 欢迎页
  if (welcome) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 64, marginBottom: 20 }}>🍳</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#1A1A1A', marginBottom: 10 }}>妙谱</Text>
          <Text style={{ fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 }}>
            AI 家庭菜谱助手{'\n'}让每顿饭都恰到好处
          </Text>
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={() => setWelcome(false)}>
          <Text style={styles.nextBtnText}>下一步</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/login')}>
          <Text style={styles.loginBtnText}>已有账户，登录</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // AI处理中
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={{ marginTop: 20, fontSize: 16, color: '#666' }}>AI正在了解你的家庭...</Text>
        <Text style={{ marginTop: 8, fontSize: 13, color: '#999' }}>为你生成专属饮食画像</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* 进度条 */}
      <View style={styles.progressBar}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i <= step ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>
      <Text style={styles.stepText}>{step + 1} / {STEPS.length}</Text>

      {/* 问题 */}
      <Text style={styles.question}>{current.q}</Text>
      {current.sub && <Text style={styles.sub}>{current.sub}</Text>}

      {/* 选项 */}
      <ScrollView style={styles.options} showsVerticalScrollIndicator={false}>
        {current.options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.option, isSelected(opt) && styles.optionSelected]}
            onPress={() => toggle(opt)}
          >
            <Text style={[styles.optionText, isSelected(opt) && styles.optionTextSelected]}>
              {isSelected(opt) ? '✓ ' : ''}{opt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 下一步 */}
      <TouchableOpacity
        style={[styles.nextBtn, !canNext() && styles.nextBtnDisabled]}
        onPress={handleNext}
        disabled={!canNext()}
      >
        <Text style={styles.nextBtnText}>
          {step < STEPS.length - 1 ? '下一步' : '生成我的饮食画像 ✨'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

async function generateAIProfile(answers: Record<string, string | string[]>): Promise<string> {
  const prompt = `用户填写了家庭饮食问卷，请根据以下信息生成一段简洁的"家庭饮食画像"，控制在80字以内，语气亲切，突出个性化特点和建议方向：

- 家庭人数：${answers['familySize']}
- 口味偏好：${(answers['tastes'] as string[])?.join('、') || '无'}
- 忌口/健康需求：${(answers['dietary'] as string[])?.join('、') || '无'}
- 做饭角色：${answers['cookRole']}
- 工作日做饭时间：${answers['cookTime']}
- 每月饮食预算：${answers['budget']}

直接输出画像文字，不要标题，不要分析，不要换行。`

  const res = await callAIText([{ role: 'user', content: prompt }])
  return res.trim()
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFBF7', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 32 },
  progressBar: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  dotActive: { backgroundColor: '#FF6B35' },
  dotInactive: { backgroundColor: '#E0E0E0' },
  stepText: { color: '#999', fontSize: 13, marginBottom: 32 },
  question: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 6, lineHeight: 32 },
  sub: { fontSize: 13, color: '#999', marginBottom: 20 },
  options: { flex: 1 },
  option: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#F0F0F0',
  },
  optionSelected: { borderColor: '#FF6B35', backgroundColor: '#FFF5F1' },
  optionText: { fontSize: 16, color: '#333' },
  optionTextSelected: { color: '#FF6B35', fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  nextBtnDisabled: { backgroundColor: '#E0E0E0' },
  nextBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    marginTop: 40,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    alignItems: 'center',
  },
  resultEmoji: { fontSize: 48, marginBottom: 12 },
  resultTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  resultText: { fontSize: 16, color: '#444', lineHeight: 26, textAlign: 'center' },
  resultHint: { marginTop: 20, fontSize: 13, color: '#999', textAlign: 'center', paddingHorizontal: 8 },
  startBtn: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 0,
  },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  loginBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  loginBtnText: { color: '#FF6B35', fontSize: 15, fontWeight: '600' },
})

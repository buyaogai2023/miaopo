import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Speech from 'expo-speech'
import { useRecipeStore } from '../../store/recipeStore'
import { Colors } from '../../constants/colors'
import { Recipe } from '../../types'
import { askCookingChef } from '../../services/deepseek'

interface ChefMsg { role: 'user' | 'chef'; text: string }

export default function CookMode() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { recipes } = useRecipeStore()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [step, setStep] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [timerOn, setTimerOn] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)

  // 大厨对话
  const [chefOpen, setChefOpen] = useState(false)
  const [chefInput, setChefInput] = useState('')
  const [chefLoading, setChefLoading] = useState(false)
  const [chefMsgs, setChefMsgs] = useState<ChefMsg[]>([])
  const [lastReply, setLastReply] = useState('')  // 显示在步骤卡片上
  const chatScrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const found = recipes.find(r => r.id === id)
    if (found) setRecipe(found)
  }, [id, recipes])

  // 切换步骤时朗读
  useEffect(() => {
    if (!recipe || !voiceOn) return
    Speech.stop()
    Speech.speak(`第${step + 1}步：${recipe.steps[step]}`, { language: 'zh-CN', rate: 0.9 })
  }, [step, recipe])

  // 进入时朗读第一步
  useEffect(() => {
    if (!recipe || !voiceOn) return
    Speech.speak(`开始烹饪${recipe.title}，第1步：${recipe.steps[0]}`, { language: 'zh-CN', rate: 0.9 })
    return () => { Speech.stop() }
  }, [recipe])

  useEffect(() => {
    if (timerOn) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerOn])

  const resetTimer = () => { setSeconds(0); setTimerOn(false) }
  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const goStep = (next: number) => {
    setStep(next)
    resetTimer()
    setLastReply('')
  }

  const toggleVoice = () => {
    const next = !voiceOn
    setVoiceOn(next)
    if (!next) Speech.stop()
    else if (recipe) Speech.speak(recipe.steps[step], { language: 'zh-CN', rate: 0.9 })
  }

  const askChef = async () => {
    if (!recipe || !chefInput.trim() || chefLoading) return
    const question = chefInput.trim()
    setChefInput('')
    const userMsg: ChefMsg = { role: 'user', text: question }
    setChefMsgs(prev => [...prev, userMsg])
    setChefLoading(true)
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100)
    try {
      const history = chefMsgs.map(m => ({ role: m.role === 'chef' ? 'assistant' : 'user', content: m.text }))
      const reply = await askCookingChef(
        recipe.title,
        recipe.ingredients,
        recipe.steps,
        step,
        question,
        history
      )
      const chefMsg: ChefMsg = { role: 'chef', text: reply }
      setChefMsgs(prev => [...prev, chefMsg])
      setLastReply(reply)
      // 自动朗读大厨回复
      if (voiceOn) {
        Speech.stop()
        Speech.speak(reply, { language: 'zh-CN', rate: 1.0 })
      }
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100)
    } catch {
      const errMsg: ChefMsg = { role: 'chef', text: '网络有问题，请重试' }
      setChefMsgs(prev => [...prev, errMsg])
    }
    setChefLoading(false)
  }

  // 快捷问题
  const quickAsk = (q: string) => {
    setChefInput(q)
    setChefOpen(true)
  }

  if (!recipe) return <View style={styles.center}><Text style={{ color: '#aaa' }}>菜谱不存在</Text></View>

  const isLast = step === recipe.steps.length - 1

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 顶部：菜名 + 控制按钮 */}
      <View style={styles.topRow}>
        <Text style={styles.recipeName} numberOfLines={1}>{recipe.title}</Text>
        <View style={styles.topBtns}>
          <TouchableOpacity style={styles.iconBtn} onPress={toggleVoice}>
            <Text style={styles.iconBtnText}>{voiceOn ? '🔊' : '🔇'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 步骤卡片 */}
      <View style={styles.stepCard}>
        <View style={styles.stepNumRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{step + 1} / {recipe.steps.length}</Text>
          </View>
          <TouchableOpacity style={styles.rereadBtn} onPress={() => {
            if (!recipe) return
            Speech.stop()
            Speech.speak(`第${step + 1}步：${recipe.steps[step]}`, { language: 'zh-CN', rate: 0.9 })
          }}>
            <Text style={styles.rereadText}>🔁 重读</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepText}>{recipe.steps[step]}</Text>
        </ScrollView>

        {/* 大厨最新回复气泡（悬浮在步骤卡上） */}
        {lastReply ? (
          <View style={styles.chefBubble}>
            <Text style={styles.chefBubbleIcon}>👨‍🍳</Text>
            <Text style={styles.chefBubbleText}>{lastReply}</Text>
          </View>
        ) : null}
      </View>

      {/* 快捷问题 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={styles.quickContent}>
        {['火候怎么看？', '可以加盐吗？', '下一步要注意什么？', '时间差不多了吗？', '这步做多久？'].map(q => (
          <TouchableOpacity key={q} style={styles.quickBtn} onPress={() => quickAsk(q)}>
            <Text style={styles.quickBtnText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 计时器 */}
      <View style={styles.timer}>
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
        <View style={styles.timerBtns}>
          <TouchableOpacity style={styles.timerBtn} onPress={() => setTimerOn(t => !t)}>
            <Text style={styles.timerBtnText}>{timerOn ? '⏸ 暂停' : '▶ 开始'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.timerBtn, styles.timerBtnSecondary]} onPress={resetTimer}>
            <Text style={styles.timerBtnSecText}>↺ 重置</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 导航 + 问大厨 */}
      <View style={styles.nav}>
        <TouchableOpacity
          style={[styles.navBtn, step === 0 && styles.navBtnDisabled]}
          onPress={() => goStep(step - 1)}
          disabled={step === 0}
        >
          <Text style={styles.navBtnText}>← 上一步</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.chefBtn} onPress={() => setChefOpen(o => !o)}>
          <Text style={styles.chefBtnText}>👨‍🍳</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnPrimary, isLast && styles.navBtnFinish]}
          onPress={() => {
            if (!isLast) {
              goStep(step + 1)
            } else {
              Speech.stop()
              if (voiceOn) Speech.speak('烹饪完成，祝您用餐愉快！', { language: 'zh-CN' })
            }
          }}
        >
          <Text style={styles.navBtnPrimaryText}>{isLast ? '🎉 完成！' : '下一步 →'}</Text>
        </TouchableOpacity>
      </View>

      {/* 大厨对话面板 */}
      {chefOpen && (
        <View style={styles.chefPanel}>
          <View style={styles.chefPanelHeader}>
            <Text style={styles.chefPanelTitle}>👨‍🍳 问大厨</Text>
            <TouchableOpacity onPress={() => setChefOpen(false)}>
              <Text style={styles.chefPanelClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {chefMsgs.length === 0 && (
              <Text style={styles.chatHint}>问任何烹饪问题，大厨实时解答并朗读</Text>
            )}
            {chefMsgs.map((m, i) => (
              <View key={i} style={[styles.msgRow, m.role === 'user' && styles.msgRowUser]}>
                {m.role === 'chef' && <Text style={styles.msgAvatar}>👨‍🍳</Text>}
                <View style={[styles.msgBubble, m.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleChef]}>
                  <Text style={[styles.msgText, m.role === 'user' && styles.msgTextUser]}>{m.text}</Text>
                </View>
              </View>
            ))}
            {chefLoading && (
              <View style={styles.msgRow}>
                <Text style={styles.msgAvatar}>👨‍🍳</Text>
                <View style={styles.msgBubbleChef}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="问大厨任何问题..."
              placeholderTextColor="#666"
              value={chefInput}
              onChangeText={setChefInput}
              onSubmitEditing={askChef}
              returnKeyType="send"
              multiline={false}
            />
            <TouchableOpacity style={[styles.sendBtn, (!chefInput.trim() || chefLoading) && styles.sendBtnDisabled]} onPress={askChef} disabled={!chefInput.trim() || chefLoading}>
              <Text style={styles.sendBtnText}>发送</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A', padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  topBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: { backgroundColor: '#2A2A2A', borderRadius: 20, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  iconBtnText: { fontSize: 18 },
  recipeName: { fontSize: 18, fontWeight: '700', color: '#fff', flex: 1, marginRight: 8 },

  stepCard: { flex: 1, backgroundColor: '#2A2A2A', borderRadius: 20, padding: 20, gap: 12 },
  stepNumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepBadge: { backgroundColor: Colors.primary + '30', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  stepBadgeText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  rereadBtn: { backgroundColor: '#3A3A3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  rereadText: { fontSize: 13, color: '#aaa' },
  stepScroll: { flex: 1 },
  stepText: { fontSize: 22, color: '#fff', lineHeight: 36, textAlign: 'center' },
  chefBubble: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#1A2A1A', borderRadius: 14, padding: 12, borderLeftWidth: 3, borderLeftColor: '#28a745' },
  chefBubbleIcon: { fontSize: 18 },
  chefBubbleText: { flex: 1, fontSize: 14, color: '#90EE90', lineHeight: 20 },

  quickRow: { flexGrow: 0 },
  quickContent: { gap: 8, paddingHorizontal: 2 },
  quickBtn: { backgroundColor: '#2A2A2A', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#3A3A3A' },
  quickBtnText: { fontSize: 12, color: '#ccc' },

  timer: { backgroundColor: '#2A2A2A', borderRadius: 16, padding: 14, alignItems: 'center', gap: 10 },
  timerText: { fontSize: 40, fontWeight: '200', color: '#fff', fontVariant: ['tabular-nums'] },
  timerBtns: { flexDirection: 'row', gap: 10 },
  timerBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  timerBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  timerBtnSecondary: { backgroundColor: '#3A3A3A' },
  timerBtnSecText: { fontSize: 14, color: '#aaa' },

  nav: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  navBtn: { flex: 1, borderRadius: 14, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: '#3A3A3A' },
  navBtnDisabled: { opacity: 0.3 },
  navBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  navBtnFinish: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  navBtnText: { fontSize: 14, color: '#aaa' },
  navBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  chefBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1A2A1A', borderWidth: 2, borderColor: '#28a745', justifyContent: 'center', alignItems: 'center' },
  chefBtnText: { fontSize: 24 },

  // 大厨对话面板
  chefPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', backgroundColor: '#222', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderTopColor: '#333', overflow: 'hidden' },
  chefPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  chefPanelTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  chefPanelClose: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
  chatScroll: { flex: 1 },
  chatContent: { padding: 16, gap: 12 },
  chatHint: { fontSize: 13, color: '#555', textAlign: 'center', marginVertical: 16 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { flexDirection: 'row-reverse' },
  msgAvatar: { fontSize: 24, marginBottom: 2 },
  msgBubble: { maxWidth: '75%', borderRadius: 16, padding: 10 },
  msgBubbleChef: { backgroundColor: '#2A2A2A', borderBottomLeftRadius: 4 },
  msgBubbleUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  msgTextUser: { color: '#fff' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#333' },
  chatInput: { flex: 1, backgroundColor: '#2A2A2A', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#3A3A3A' },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})

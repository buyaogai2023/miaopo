import { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Alert } from 'react-native'
import { Audio } from 'expo-av'
import * as Speech from 'expo-speech'
import { supabase } from '../services/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams } from 'expo-router'
import { chatWithChefStream, Message, AppData, AppAction } from '../services/aiChef'
import { Colors } from '../constants/colors'

const API_KEY = 'sk-9e9c16fa845349f98214e473b5148f96'
const CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

const newId = () => Date.now().toString() + Math.random().toString(36).slice(2)

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export default function ChefScreen() {
  const { recipe } = useLocalSearchParams<{ recipe?: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [autoListen, setAutoListen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [appData, setAppData] = useState<AppData>({ fridge: [], shopping: [], recipes: [], mealPlan: [] })
  const recordingRef = useRef<Audio.Recording | null>(null)
  const listRef = useRef<FlatList>(null)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const autoListenRef = useRef(false)

  useEffect(() => { autoListenRef.current = autoListen }, [autoListen])

  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])).start()
    } else {
      pulseAnim.stopAnimation()
      pulseAnim.setValue(1)
    }
  }, [isRecording])

  useEffect(() => { init() }, [])

  const loadData = async (): Promise<AppData> => {
    const [f, s, r, m] = await Promise.all([
      AsyncStorage.getItem('miaopo_fridge'),
      AsyncStorage.getItem('miaopo_shopping'),
      AsyncStorage.getItem('miaopo_recipes'),
      AsyncStorage.getItem('miaopo_mealplan'),
    ])
    return {
      fridge: f ? JSON.parse(f) : [],
      shopping: s ? JSON.parse(s) : [],
      recipes: r ? JSON.parse(r) : [],
      mealPlan: m ? JSON.parse(m) : [],
    }
  }

  const addAssistant = (content: string) => {
    setMessages(prev => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
      return [...prev, { role: 'assistant' as const, content }]
    })
  }

  // 流式更新最后一条 assistant 消息
  const appendToLast = (delta: string) => {
    setMessages(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last.role !== 'assistant') return prev
      const updated = { ...last, content: last.content + delta }
      return [...prev.slice(0, -1), updated]
    })
    listRef.current?.scrollToEnd({ animated: false })
  }

  const stopSound = () => { try { Speech.stop() } catch {} }

  const speak = (text: string, afterSpeak?: () => void) => {
    if (!voiceOn) { afterSpeak?.(); return }
    Speech.stop()
    Speech.speak(text.replace(/[*#`\[\]]/g, ''), {
      language: 'zh-CN',
      rate: 0.95,
      onDone: afterSpeak,
      onError: afterSpeak,
    })
  }

  const init = async () => {
    const data = await loadData()
    setAppData(data)
    setLoading(true)
    try {
      addAssistant('')
      const { message, actions } = await chatWithChefStream([], data, recipe, appendToLast)
      if (actions.length) await runActions(actions, data)
      speak(message, () => { if (autoListenRef.current) toggleRecording() })
    } catch {
      addAssistant('你好！我是妙妙大厨，今天想吃什么？')
    } finally {
      setLoading(false)
    }
  }

  const send = async (text?: string) => {
    const t = (text || input).trim()
    if (!t || loading) return
    setInput('')
    stopSound()

    const userMsg: Message = { role: 'user', content: t }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setLoading(true)
    setLogs([])

    try {
      const freshData = await loadData()
      setAppData(freshData)
      addAssistant('')
      const { message, actions } = await chatWithChefStream(newMsgs, freshData, recipe, appendToLast)
      if (actions.length) await runActions(actions, freshData)
      speak(message, () => { if (autoListenRef.current) toggleRecording() })
    } catch {
      addAssistant('出错了，请再说一遍')
    } finally {
      setLoading(false)
    }
  }

  // 点一下开始录音，再点一下停止并发送
  const toggleRecording = async () => {
    if (isRecording) {
      // 停止
      setIsRecording(false)
      setTranscribing(true)
      try {
        const uri = recordingRef.current?.getURI() ?? null
        await recordingRef.current?.stopAndUnloadAsync()
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
        recordingRef.current = null
        if (!uri) return

        // 1. 上传到 Supabase storage 获得公开 URL
        const blob = await fetch(uri).then(r => r.blob())
        const fileName = `asr_${Date.now()}.m4a`
        await supabase.storage.createBucket('buyaogai2023', { public: true }).catch(() => {})
        const { error: upErr } = await supabase.storage
          .from('buyaogai2023')
          .upload(fileName, blob, { contentType: 'audio/m4a', upsert: true })
        if (upErr) throw new Error('上传失败: ' + upErr.message)
        const { data: { publicUrl } } = supabase.storage.from('buyaogai2023').getPublicUrl(fileName)

        // 2. 转录
        const json = await withTimeout(
          fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
            body: JSON.stringify({
              model: 'qwen-audio-turbo',
              input: {
                messages: [{
                  role: 'user',
                  content: [
                    { audio: publicUrl },
                    { text: '请转录这段语音，只输出转录的文字，不要任何其他内容' },
                  ],
                }],
              },
            }),
          }).then(async r => {
            const raw = await r.text()
            Alert.alert(`HTTP ${r.status}`, raw.slice(0, 400))
            return JSON.parse(raw)
          }),
          20000,
        )
        supabase.storage.from('buyaogai2023').remove([fileName]).catch(() => {})
        const text = (json.output?.choices?.[0]?.message?.content?.[0]?.text || '').trim()
        if (text) await send(text)
        else if (autoListenRef.current) toggleRecording()
      } catch (e: any) {
        Alert.alert('转录失败', e?.message || String(e))
        if (autoListenRef.current) toggleRecording()
      } finally {
        setTranscribing(false)
      }
    } else {
      // 开始
      try {
        stopSound()
        const perm = await Audio.requestPermissionsAsync()
        if (!perm.granted) { Alert.alert('需要麦克风权限'); return }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
        recordingRef.current = recording
        setIsRecording(true)
      } catch (e: any) {
        Alert.alert('录音失败', e?.message || String(e))
      }
    }
  }

  const runActions = async (actions: AppAction[], data: AppData) => {
    const d = { fridge: [...data.fridge], shopping: [...data.shopping], recipes: [...data.recipes], mealPlan: [...data.mealPlan] }
    const newLogs: string[] = []
    for (const { type, payload: p } of actions) {
      switch (type) {
        case 'add_shopping':
          d.shopping.unshift({ id: newId(), name: p.name, amount: p.amount || '适量', category: p.category || '其他', checked: false, created_at: new Date().toISOString(), user_id: '' })
          newLogs.push(`✅ 购物清单 + ${p.name}`); break
        case 'batch_add_shopping':
          for (const i of (p.items || [])) d.shopping.unshift({ id: newId(), name: i.name, amount: i.amount || '适量', category: i.category || '其他', checked: false, created_at: new Date().toISOString(), user_id: '' })
          newLogs.push(`✅ 批量添加 ${p.items?.length} 项`); break
        case 'remove_shopping':
          d.shopping = d.shopping.filter(i => !i.name.includes(p.name))
          newLogs.push(`🗑 购物清单 - ${p.name}`); break
        case 'check_shopping':
          d.shopping = d.shopping.map(i => i.name.includes(p.name) ? { ...i, checked: true } : i)
          newLogs.push(`☑️ 已购 ${p.name}`); break
        case 'clear_checked_shopping':
          d.shopping = d.shopping.filter(i => !i.checked)
          newLogs.push(`🗑 清除已购`); break
        case 'clear_all_shopping':
          d.shopping = []
          newLogs.push(`🗑 购物清单清空`); break
        case 'add_fridge':
          d.fridge.unshift({ id: newId(), name: p.name, amount: p.amount || '适量', added_at: new Date().toISOString() } as any)
          newLogs.push(`🧊 冰箱 + ${p.name}`); break
        case 'remove_fridge':
          d.fridge = d.fridge.filter(i => !i.name.includes(p.name))
          newLogs.push(`🧊 冰箱 - ${p.name}`); break
        case 'clear_fridge':
          d.fridge = []
          newLogs.push(`🧊 冰箱清空`); break
        case 'update_fridge_amount':
          d.fridge = d.fridge.map(i => i.name.includes(p.name) ? { ...i, amount: p.amount } : i)
          newLogs.push(`🧊 更新 ${p.name} → ${p.amount}`); break
        case 'add_recipe':
          d.recipes.unshift({ id: newId(), title: p.title, ingredients: p.ingredients || [], steps: p.steps || [], cook_time: p.cook_time, servings: p.servings, tags: [], user_id: '', created_at: new Date().toISOString() } as any)
          newLogs.push(`📖 菜谱 + ${p.title}`); break
        case 'delete_recipe':
          d.recipes = d.recipes.filter(r => r.id !== p.id)
          newLogs.push(`🗑 删除菜谱`); break
        case 'generate_shopping_from_recipe': {
          const rec = d.recipes.find(r => r.id === p.recipe_id)
          if (rec) for (const ing of rec.ingredients) d.shopping.unshift({ id: newId(), name: ing.name, amount: ing.amount, category: '其他', checked: false, created_at: new Date().toISOString(), user_id: '' })
          newLogs.push(`✅ 生成购物清单`); break
        }
        case 'add_meal_plan':
          d.mealPlan = d.mealPlan.filter(m => !(m.date === p.date && m.meal_type === p.meal_type))
          d.mealPlan.push({ id: newId(), date: p.date, meal_type: p.meal_type, recipe_id: p.recipe_id || '', recipe_title: p.recipe_title } as any)
          newLogs.push(`📅 ${p.date} ${p.meal_type} → ${p.recipe_title}`); break
        case 'clear_meal_plan':
          d.mealPlan = []
          newLogs.push(`📅 餐计划清空`); break
      }
    }
    await Promise.all([
      AsyncStorage.setItem('miaopo_fridge', JSON.stringify(d.fridge)),
      AsyncStorage.setItem('miaopo_shopping', JSON.stringify(d.shopping)),
      AsyncStorage.setItem('miaopo_recipes', JSON.stringify(d.recipes)),
      AsyncStorage.setItem('miaopo_mealplan', JSON.stringify(d.mealPlan)),
    ])
    setAppData(d)
    setLogs(newLogs)
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>👨‍🍳 妙妙大厨</Text>
          <Text style={styles.headerSub}>🧊{appData.fridge.length} · 🛒{appData.shopping.filter(i=>!i.checked).length} · 📖{appData.recipes.length}</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[styles.iconBtn, autoListen && styles.iconBtnOn]}
            onPress={() => {
              const next = !autoListen
              setAutoListen(next)
              if (!next && isRecording) stopRecording()
            }}
          >
            <Text style={styles.iconBtnText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, voiceOn && styles.iconBtnOn]}
            onPress={() => { setVoiceOn(v => !v); stopSound() }}
          >
            <Text style={styles.iconBtnText}>{voiceOn ? '🔊' : '🔇'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {logs.length > 0 && (
        <View style={styles.logBox}>
          {logs.map((l, i) => <Text key={i} style={styles.logText}>{l}</Text>)}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'assistant' ? styles.chefBubble : styles.userBubble]}>
            {item.role === 'assistant' && <Text style={styles.chefLabel}>👨‍🍳 妙妙</Text>}
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {/* 连续对话模式：大麦克风 */}
      {autoListen && (
        <View style={styles.autoListenArea}>
          {loading && <View style={styles.thinkingRow}><ActivityIndicator size="small" color={Colors.primary} /><Text style={styles.thinkingText}>大厨思考中...</Text></View>}
          {transcribing && <View style={styles.thinkingRow}><ActivityIndicator size="small" color="#FFA500" /><Text style={styles.thinkingText}>转录中...</Text></View>}
          <TouchableOpacity onPress={() => { if (!loading && !transcribing) toggleRecording() }} activeOpacity={0.8}>
            <Animated.View style={[styles.bigMic, isRecording && styles.bigMicActive, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.bigMicText}>{isRecording ? '🔴' : '🎤'}</Text>
              <Text style={styles.bigMicLabel}>{isRecording ? '再按停止发送' : loading ? '等待中...' : '按一下说话'}</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}

      {/* 普通模式底栏 */}
      {!autoListen && (
        <View style={styles.bar}>
          {(loading || transcribing) && (
            <View style={styles.thinkingInline}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.thinkingText}>{transcribing ? '转录中...' : '思考中...'}</Text>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="问大厨..."
              placeholderTextColor="#ffffff50"
              returnKeyType="send"
              onSubmitEditing={() => send()}
            />
            <TouchableOpacity
              style={[styles.micBtn, isRecording && styles.micBtnActive]}
              onPress={() => { if (!loading && !transcribing) toggleRecording() }}
              disabled={loading || transcribing}
            >
              <Animated.Text style={[styles.micText, { transform: [{ scale: pulseAnim }] }]}>
                {isRecording ? '🔴' : '🎤'}
              </Animated.Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendOff]}
              onPress={() => send()}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendText}>发</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1E' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: '#ffffff10' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: '#ffffff50', marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#ffffff30', justifyContent: 'center', alignItems: 'center' },
  iconBtnOn: { backgroundColor: Colors.primary + '40', borderColor: Colors.primary },
  iconBtnText: { fontSize: 18 },
  logBox: { backgroundColor: '#1A2E1A', margin: 10, borderRadius: 10, padding: 10, gap: 3 },
  logText: { fontSize: 13, color: '#5CB85C' },
  list: { padding: 14, gap: 10, paddingBottom: 4 },
  bubble: { maxWidth: '85%', borderRadius: 18, padding: 13 },
  chefBubble: { alignSelf: 'flex-start', backgroundColor: '#1E1E3F' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  chefLabel: { fontSize: 11, color: Colors.primary, marginBottom: 3, fontWeight: '600' },
  bubbleText: { fontSize: 16, color: '#fff', lineHeight: 23 },
  // 连续对话
  autoListenArea: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { fontSize: 13, color: '#ffffff60' },
  bigMic: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1E2A4E', borderWidth: 2, borderColor: '#ffffff20', justifyContent: 'center', alignItems: 'center', gap: 6 },
  bigMicActive: { backgroundColor: '#3D1020', borderColor: '#FF4466' },
  bigMicText: { fontSize: 44 },
  bigMicLabel: { fontSize: 12, color: '#ffffff70' },
  // 普通底栏
  bar: { backgroundColor: '#16213E', paddingBottom: 8 },
  thinkingInline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  inputRow: { flexDirection: 'row', padding: 10, gap: 8 },
  input: { flex: 1, backgroundColor: '#1E2A4E', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: '#fff' },
  micBtn: { backgroundColor: '#1E2A4E', borderRadius: 22, width: 48, justifyContent: 'center', alignItems: 'center' },
  micBtnActive: { backgroundColor: '#3D1020' },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 22, width: 48, justifyContent: 'center', alignItems: 'center' },
  sendOff: { opacity: 0.3 },
  sendText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  micText: { fontSize: 22 },
})

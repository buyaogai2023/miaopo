import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Modal, StyleSheet, Animated, KeyboardAvoidingView,
  Platform, ActivityIndicator, Dimensions, Alert, ScrollView,
} from 'react-native'
import * as Speech from 'expo-speech'

// expo-speech-recognition 只在开发构建中可用，Expo Go 会 fallback
let ExpoSpeechRecognitionModule: any = null
let useSpeechRecognitionEvent: any = () => {}
try {
  const mod = require('expo-speech-recognition')
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent
} catch {
  // Expo Go 不支持，忽略
}
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useChatStore, SavedMessage } from '../store/chatStore'
import { chatWithChefStream, AppAction } from '../services/aiChef'
import { Colors } from '../constants/colors'

const { height: SCREEN_H } = Dimensions.get('window')
const newId = () => Date.now().toString() + Math.random().toString(36).slice(2)

async function loadAppData() {
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

async function saveAppData(d: any) {
  await Promise.all([
    AsyncStorage.setItem('miaopo_fridge', JSON.stringify(d.fridge)),
    AsyncStorage.setItem('miaopo_shopping', JSON.stringify(d.shopping)),
    AsyncStorage.setItem('miaopo_recipes', JSON.stringify(d.recipes)),
    AsyncStorage.setItem('miaopo_mealplan', JSON.stringify(d.mealPlan)),
  ])
}

export default function FloatingChef() {
  const { messages, visible, appData, addMessage, appendToLast, setVisible, setAppData, saved, saveMessage, unsaveMessage, loadSaved, saveMessages, loadMessages, clearMessages } = useChatStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [liveText, setLiveText] = useState('')  // 实时识别中的文字
  const [autoMode, setAutoMode] = useState(false)  // 连续对话模式
  const [voiceOn, setVoiceOn] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const [inited, setInited] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const autoModeRef = useRef(false)
  const listRef = useRef<FlatList>(null)
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => { autoModeRef.current = autoMode }, [autoMode])

  // 脉冲动画
  useEffect(() => {
    if (listening) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start()
    } else {
      pulseAnim.stopAnimation(); pulseAnim.setValue(1)
    }
  }, [listening])

  // 实时识别结果
  useSpeechRecognitionEvent('result', (e: any) => {
    const text = e.results[0]?.transcript || ''
    setLiveText(text)
  })

  // 识别结束 → 自动发送
  useSpeechRecognitionEvent('end', () => {
    setListening(false)
    const text = liveText.trim()
    setLiveText('')
    if (text) send(text)
    else if (autoModeRef.current) startListening()
  })

  useSpeechRecognitionEvent('error', (_e: any) => {
    setListening(false)
    setLiveText('')
    if (autoModeRef.current) startListening()
  })

  // 打开/关闭动画
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start()
      if (!inited) { setInited(true); init() }
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }).start()
    }
  }, [visible])

  useEffect(() => {
    loadSaved()
    // 加载历史聊天记录，有记录则自动弹出
    loadMessages().then(hasHistory => {
      if (hasHistory) {
        setInited(true)  // 有历史记录，跳过打招呼
        loadAppData().then(setAppData)
      }
    })
  }, [])

  const init = async () => {
    const data = await loadAppData()
    setAppData(data)
    setLoading(true)
    try {
      addMessage({ role: 'assistant', content: '' })
      const { message, actions } = await chatWithChefStream([], data, undefined, appendToLast)
      if (actions.length) await runActions(actions, data)
      speak(message, () => { if (autoModeRef.current) startListening() })
      await saveMessages()
    } catch {
      // reset empty msg
      useChatStore.setState(s => ({
        messages: s.messages.length === 1 && s.messages[0].content === ''
          ? [{ role: 'assistant', content: '你好！我是妙妙大厨，今天想吃什么？' }]
          : s.messages
      }))
    } finally {
      setLoading(false)
    }
  }

  const startListening = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('提示', '语音功能需要开发构建版本，请用文字输入')
      return
    }
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!granted) { Alert.alert('需要语音识别权限'); return }
      ExpoSpeechRecognitionModule.start({ lang: 'zh-CN', interimResults: true, continuous: false })
      setListening(true)
      setLiveText('')
    } catch (e: any) { Alert.alert('启动失败', e?.message) }
  }

  const stopListening = () => {
    ExpoSpeechRecognitionModule?.stop()
    setListening(false)
  }

  const speak = (text: string, onDone?: () => void) => {
    if (!voiceOn || !text) { onDone?.(); return }
    Speech.stop()
    Speech.speak(text.replace(/[*#`\[\]]/g, ''), {
      language: 'zh-CN', rate: 0.95,
      onDone: onDone,
      onError: onDone,
    })
  }

  const send = async (text?: string) => {
    const t = (text || input).trim()
    if (!t || loading) return
    setInput('')
    Speech.stop()
    addMessage({ role: 'user', content: t })
    setLoading(true); setLogs([])
    try {
      const freshData = await loadAppData()
      setAppData(freshData)
      const allMsgs = useChatStore.getState().messages
      addMessage({ role: 'assistant', content: '' })
      const { message, actions } = await chatWithChefStream(
        allMsgs.filter(m => m.content), freshData, undefined, appendToLast
      )
      if (actions.length) await runActions(actions, freshData)
      speak(message, () => { if (autoModeRef.current) startListening() })
      await saveMessages()
    } catch {
      addMessage({ role: 'assistant', content: '出错了，请再说一遍' })
    } finally {
      setLoading(false)
    }
  }

  const runActions = async (actions: AppAction[], data: any) => {
    const d = { ...data, fridge: [...data.fridge], shopping: [...data.shopping], recipes: [...data.recipes], mealPlan: [...data.mealPlan] }
    const newLogs: string[] = []
    for (const { type, payload: p } of actions) {
      switch (type) {
        case 'add_shopping': d.shopping.unshift({ id: newId(), name: p.name, amount: p.amount || '适量', category: p.category || '其他', checked: false, created_at: new Date().toISOString(), user_id: '' }); newLogs.push(`✅ 购物 + ${p.name}`); break
        case 'batch_add_shopping': for (const i of (p.items || [])) d.shopping.unshift({ id: newId(), name: i.name, amount: i.amount || '适量', category: '其他', checked: false, created_at: new Date().toISOString(), user_id: '' }); newLogs.push(`✅ 批量添加`); break
        case 'remove_shopping': d.shopping = d.shopping.filter((i: any) => !i.name.includes(p.name)); newLogs.push(`🗑 购物 - ${p.name}`); break
        case 'add_fridge': d.fridge.unshift({ id: newId(), name: p.name, amount: p.amount || '适量', added_at: new Date().toISOString() }); newLogs.push(`🧊 冰箱 + ${p.name}`); break
        case 'remove_fridge': d.fridge = d.fridge.filter((i: any) => !i.name.includes(p.name)); newLogs.push(`🧊 冰箱 - ${p.name}`); break
        case 'add_recipe': d.recipes.unshift({ id: newId(), title: p.title, ingredients: p.ingredients || [], steps: p.steps || [], cook_time: p.cook_time, servings: p.servings, tags: [], user_id: '', created_at: new Date().toISOString() }); newLogs.push(`📖 菜谱 + ${p.title}`); break
        case 'add_meal_plan': d.mealPlan = d.mealPlan.filter((m: any) => !(m.date === p.date && m.meal_type === p.meal_type)); d.mealPlan.push({ id: newId(), date: p.date, meal_type: p.meal_type, recipe_id: p.recipe_id || '', recipe_title: p.recipe_title }); newLogs.push(`📅 ${p.date} → ${p.recipe_title}`); break
      }
    }
    await saveAppData(d); setAppData(d); setLogs(newLogs)
  }

  return (
    <>
      {/* 悬浮按钮 */}
      {!visible && (
        <TouchableOpacity style={styles.fab} onPress={() => setVisible(true)} activeOpacity={0.85}>
          <Text style={styles.fabText}>👨‍🍳</Text>
        </TouchableOpacity>
      )}

      {/* 全屏 Modal 聊天 */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => setVisible(false)}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* 顶栏 */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>👨‍🍳 妙妙大厨</Text>
              <Text style={styles.headerSub}>🧊{appData.fridge.length} · 🛒{appData.shopping.filter((i: any) => !i.checked).length} · 📖{appData.recipes.length}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowSaved(true)} style={styles.voiceBtn}>
              <Text style={styles.voiceBtnText}>🔖</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert('清空对话', '确定清空所有聊天记录？', [
                { text: '取消', style: 'cancel' },
                { text: '清空', style: 'destructive', onPress: () => { clearMessages(); setInited(false) } }
              ])}
              style={styles.voiceBtn}
            >
              <Text style={styles.voiceBtnText}>🗑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setVoiceOn(v => !v); Speech.stop() }} style={styles.voiceBtn}>
              <Text style={styles.voiceBtnText}>{voiceOn ? '🔊' : '🔇'}</Text>
            </TouchableOpacity>
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
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item, index }) => (
              <View style={[styles.bubble, item.role === 'assistant' ? styles.chefBubble : styles.userBubble]}>
                {item.role === 'assistant' && (
                  <View style={styles.chefLabelRow}>
                    <Text style={styles.chefLabel}>👨‍🍳 妙妙</Text>
                    {item.content ? (
                      <TouchableOpacity
                        onPress={() => saveMessage(item.content)}
                        style={styles.starBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.starText}>⭐</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
                <Text style={styles.bubbleText}>{item.content || (loading ? '...' : '')}</Text>
              </View>
            )}
          />

          {loading && (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.thinkingText}>思考中...</Text>
            </View>
          )}

          {liveText ? (
            <View style={styles.liveTextBox}>
              <Text style={styles.liveTextLabel}>🎙 {liveText}</Text>
            </View>
          ) : null}

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
            <View style={styles.bar}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="问大厨..."
                placeholderTextColor="#ffffff40"
                returnKeyType="send"
                onSubmitEditing={() => send()}
              />
              {/* 连续对话 */}
              <TouchableOpacity
                style={[styles.autoBtn, autoMode && styles.autoBtnOn]}
                onPress={() => {
                  const next = !autoMode
                  setAutoMode(next)
                  if (next) startListening()
                  else stopListening()
                }}
              >
                <Text style={styles.micText}>🔄</Text>
              </TouchableOpacity>
              {/* 单次语音 */}
              <TouchableOpacity
                style={[styles.micBtn, listening && styles.micActive]}
                onPress={listening ? stopListening : startListening}
                disabled={loading}
              >
                <Animated.Text style={[styles.micText, { transform: [{ scale: pulseAnim }] }]}>
                  {listening ? '🔴' : '🎤'}
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
          </KeyboardAvoidingView>
          {/* 收藏夹面板 */}
          <Modal visible={showSaved} transparent animationType="slide" onRequestClose={() => setShowSaved(false)}>
            <View style={styles.savedOverlay}>
              <View style={styles.savedSheet}>
                <View style={styles.savedHeader}>
                  <Text style={styles.savedTitle}>🔖 收藏的回复</Text>
                  <TouchableOpacity onPress={() => setShowSaved(false)}>
                    <Text style={styles.savedClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                {saved.length === 0 ? (
                  <View style={styles.savedEmpty}>
                    <Text style={styles.savedEmptyText}>还没有收藏{'\n'}在大厨回复上点 ⭐ 收藏</Text>
                  </View>
                ) : (
                  <ScrollView contentContainerStyle={styles.savedList}>
                    {saved.map((item) => (
                      <View key={item.id} style={styles.savedItem}>
                        <Text style={styles.savedTime}>
                          {new Date(item.savedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={styles.savedContent}>{item.content}</Text>
                        <TouchableOpacity onPress={() => unsaveMessage(item.id)} style={styles.unsaveBtn}>
                          <Text style={styles.unsaveBtnText}>取消收藏</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        </Animated.View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 92, right: 18,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 10,
  },
  fabText: { fontSize: 28 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SCREEN_H * 0.88,
    backgroundColor: '#0F0F1E',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#ffffff10',
  },
  closeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 16, color: '#ffffff60' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 11, color: '#ffffff40', marginTop: 2 },
  voiceBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  voiceBtnText: { fontSize: 20 },
  logBox: { backgroundColor: '#1A2E1A', marginHorizontal: 10, marginTop: 6, borderRadius: 10, padding: 8, gap: 2 },
  logText: { fontSize: 12, color: '#5CB85C' },
  list: { padding: 14, gap: 10, paddingBottom: 6 },
  bubble: { maxWidth: '85%', borderRadius: 18, padding: 13 },
  chefBubble: { alignSelf: 'flex-start', backgroundColor: '#1E1E3F' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  chefLabel: { fontSize: 11, color: Colors.primary, marginBottom: 3, fontWeight: '600' },
  bubbleText: { fontSize: 16, color: '#fff', lineHeight: 23 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  thinkingText: { fontSize: 13, color: '#ffffff40' },
  bar: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#16213E' },
  input: { flex: 1, backgroundColor: '#1E2A4E', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: '#fff' },
  liveTextBox: { backgroundColor: '#1A1A3E', marginHorizontal: 14, marginBottom: 4, borderRadius: 10, padding: 8 },
  liveTextLabel: { fontSize: 14, color: '#aaaaff', fontStyle: 'italic' },
  autoBtn: { backgroundColor: '#1E2A4E', borderRadius: 22, width: 48, justifyContent: 'center', alignItems: 'center' },
  autoBtnOn: { backgroundColor: '#2E1A4E' },
  micBtn: { backgroundColor: '#1E2A4E', borderRadius: 22, width: 48, justifyContent: 'center', alignItems: 'center' },
  micActive: { backgroundColor: '#3D1020' },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 22, width: 48, justifyContent: 'center', alignItems: 'center' },
  sendOff: { opacity: 0.3 },
  sendText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  micText: { fontSize: 22 },
  chefLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  starBtn: { padding: 2 },
  starText: { fontSize: 14 },
  savedOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  savedSheet: { backgroundColor: '#0F0F1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_H * 0.75 },
  savedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#ffffff10' },
  savedTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  savedClose: { fontSize: 16, color: '#ffffff60', padding: 4 },
  savedEmpty: { padding: 40, alignItems: 'center' },
  savedEmptyText: { fontSize: 15, color: '#ffffff40', textAlign: 'center', lineHeight: 24 },
  savedList: { padding: 14, gap: 12 },
  savedItem: { backgroundColor: '#1E1E3F', borderRadius: 14, padding: 14, gap: 8 },
  savedTime: { fontSize: 11, color: '#ffffff40' },
  savedContent: { fontSize: 15, color: '#fff', lineHeight: 22 },
  unsaveBtn: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#ffffff10', borderRadius: 10 },
  unsaveBtnText: { fontSize: 12, color: '#ffffff60' },
})

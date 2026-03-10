import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { router, useLocalSearchParams } from 'expo-router'
import { extractRecipeFromText, generateRecipeByName } from '../../services/deepseek'
import { extractDouyinText } from '../../services/douyinApi'
import { useRecipeStore } from '../../store/recipeStore'
import { Colors } from '../../constants/colors'
import { Recipe } from '../../types'

const isUrl = (text: string) => /^https?:\/\//i.test(text.trim())

// 从文字里提取抖音链接（支持分享文字中嵌入的链接）
const extractDouyinUrl = (text: string): string | null => {
  const match = text.match(/https?:\/\/[^\s]*(?:douyin\.com|v\.douyin\.com)[^\s]*/i)
  return match ? match[0] : null
}

// 无法抓取内容的平台（SPA/需要登录/跳转APP）
const BLOCKED_DOMAINS = ['douyin.com', 'v.douyin.com', 'tiktok.com', 'vm.tiktok.com', 'xiaohongshu.com', 'xhslink.com', 'bilibili.com', 'weibo.com']
const isBlockedPlatform = (url: string) => BLOCKED_DOMAINS.some(d => url.includes(d))

export default function ImportRecipe() {
  const params = useLocalSearchParams()
  const [text, setText] = useState((params.prefill as string) || '')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [preview, setPreview] = useState<Partial<Recipe> | null>(null)
  const { addRecipe } = useRecipeStore()

  const pasteFromClipboard = async () => {
    const content = await Clipboard.getStringAsync()
    if (content) setText(content)
  }

  const extractRecipe = async () => {
    const input = text.trim()
    if (!input) { Alert.alert('提示', '请先输入或粘贴菜谱内容'); return }

    setLoading(true)
    setPreview(null)

    try {
      let content = input

      // 检测文字里嵌入的抖音链接（如抖音分享文字）
      const embeddedDouyinUrl = !isUrl(input) ? extractDouyinUrl(input) : null
      if (embeddedDouyinUrl) {
        setLoadingMsg('检测到抖音链接，正在读取视频...')
        try {
          const result = await extractDouyinText(embeddedDouyinUrl)
          setLoadingMsg(result.source === 'asr' ? 'AI 听完了视频，提取菜谱中...' : '提取到视频描述，AI 分析中...')
          content = result.text
        } catch (e: any) {
          setLoading(false)
          Alert.alert('抖音解析失败', e.message || '无法读取该视频内容，请手动输入菜名', [{ text: '知道了' }])
          return
        }
      }

      // 检测到纯 URL
      else if (isUrl(input)) {
        // 抖音链接 → 调用后端提取字幕
        if (isBlockedPlatform(input)) {
          if (!input.includes('douyin.com')) {
            setLoading(false)
            Alert.alert(
              '不支持该平台',
              '目前支持抖音链接自动提取。小红书、B站等请复制文字内容粘贴进来。',
              [{ text: '知道了' }]
            )
            return
          }
          setLoadingMsg('正在读取抖音视频...')
          try {
            const result = await extractDouyinText(input)
            setLoadingMsg(
              result.source === 'asr'
                ? 'AI 听完了视频，提取菜谱中...'
                : '视频描述已含菜谱，AI 分析中...'
            )
            content = result.text
          } catch (e: any) {
            setLoading(false)
            Alert.alert('抖音解析失败', e.message || '无法读取该视频内容，请手动输入菜名', [{ text: '知道了' }])
            return
          }
        } else {
          setLoading(false)
          Alert.alert(
            '不支持链接导入',
            '请复制页面的文字内容粘贴进来，或者直接输入菜名点「按菜名生成」。',
            [{ text: '知道了' }]
          )
          return
        }
      }

      setLoadingMsg('AI 提取菜谱中...')
      try {
        const result = await extractRecipeFromText(content)
        setPreview(result)
      } catch (e: any) {
        if (e?.message === 'NO_RECIPE_FOUND') {
          // 内容里没有菜谱，问用户要菜名
          Alert.alert(
            '未找到菜谱',
            '内容中没有找到菜谱信息。\n\n如果你知道菜名，可以直接输入菜名让 AI 生成完整菜谱。',
            [
              { text: '取消', style: 'cancel' },
              {
                text: '输入菜名生成',
                onPress: () => {
                  Alert.prompt?.('输入菜名', '例如：番茄炒蛋', async (name) => {
                    if (!name?.trim()) return
                    setLoading(true)
                    setLoadingMsg('AI 生成菜谱中...')
                    try {
                      const result = await generateRecipeByName(name.trim())
                      setPreview(result)
                    } catch {
                      Alert.alert('生成失败', '请重试')
                    }
                    setLoading(false)
                  })
                }
              }
            ]
          )
        } else {
          Alert.alert('提取失败', '请检查内容是否包含菜谱信息')
        }
      }
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const saveRecipe = async () => {
    if (!preview) return
    await addRecipe({
      title: preview.title || '未命名菜谱',
      ingredients: preview.ingredients || [],
      steps: preview.steps || [],
      cook_time: preview.cook_time,
      servings: preview.servings,
      tags: [],
      user_id: '',
    })
    Alert.alert('保存成功 🎉', '菜谱已添加到菜谱库', [
      { text: '查看菜谱库', onPress: () => router.push('/') }
    ])
    setText('')
    setPreview(null)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>粘贴菜谱内容</Text>
      <Text style={styles.hint}>支持菜谱文字 · 小红书笔记正文</Text>

      {/* 抖音提示 */}
      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>📱 抖音/小红书怎么用？</Text>
        <Text style={styles.tipText}>复制视频的<Text style={styles.tipBold}>文字描述</Text>粘贴进来，不是粘贴链接</Text>
        <Text style={styles.tipText}>或者直接输入<Text style={styles.tipBold}>菜名</Text>，AI 帮你生成完整菜谱</Text>
      </View>

      <TextInput
        style={styles.input} multiline numberOfLines={6}
        placeholder="把菜谱文字粘贴到这里，或者直接输入菜名..." placeholderTextColor={Colors.textLight}
        value={text} onChangeText={setText}
      />

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.pasteBtn} onPress={pasteFromClipboard}>
          <Text style={styles.pasteBtnText}>📋 粘贴</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pasteBtn, { flex: 1 }]} onPress={async () => {
          const input = text.trim()
          if (!input) { Alert.alert('请先输入菜名'); return }
          if (isUrl(input)) { Alert.alert('提示', '这是一个链接，请改用「AI提取菜谱」按钮'); return }
          setLoading(true)
          setLoadingMsg('AI 生成菜谱中...')
          try {
            const result = await generateRecipeByName(input)
            setPreview(result)
          } catch {
            Alert.alert('生成失败', '请重试')
          }
          setLoading(false)
          setLoadingMsg('')
        }}>
          <Text style={styles.pasteBtnText}>🤖 按菜名生成</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.extractBtn, loading && styles.btnDisabled]} onPress={extractRecipe} disabled={loading}>
        {loading
          ? <View style={styles.loadingRow}><ActivityIndicator color="#fff" /><Text style={styles.loadingText}>{loadingMsg}</Text></View>
          : <Text style={styles.extractBtnText}>✨ AI 提取菜谱</Text>}
      </TouchableOpacity>

      {preview && (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>{preview.title}</Text>
          {preview.cook_time ? <Text style={styles.previewMeta}>⏱ {preview.cook_time}分钟 · 👥 {preview.servings}人份</Text> : null}
          <Text style={styles.sectionTitle}>食材</Text>
          {preview.ingredients?.map((ing, i) => (
            <Text key={i} style={styles.item}>· {ing.name} {ing.amount}</Text>
          ))}
          <Text style={styles.sectionTitle}>步骤</Text>
          {preview.steps?.map((step, i) => (
            <Text key={i} style={styles.item}>{i + 1}. {step}</Text>
          ))}
          <TouchableOpacity style={styles.saveBtn} onPress={saveRecipe}>
            <Text style={styles.saveBtnText}>保存到菜谱库</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 16, fontWeight: '600', color: Colors.text },
  hint: { fontSize: 13, color: Colors.textLight, marginTop: -6 },
  tipBox: { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 14, gap: 6, borderLeftWidth: 3, borderLeftColor: '#FFC107' },
  tipTitle: { fontSize: 13, fontWeight: '700', color: '#7B5800' },
  tipText: { fontSize: 13, color: '#7B5800', lineHeight: 20 },
  tipBold: { fontWeight: '700' },
  input: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, fontSize: 15,
    color: Colors.text, minHeight: 130, textAlignVertical: 'top', borderWidth: 1, borderColor: Colors.border,
  },
  btnRow: { flexDirection: 'row', gap: 8 },
  pasteBtn: { backgroundColor: Colors.card, borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  pasteBtnText: { fontSize: 14, color: Colors.text },
  extractBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  extractBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 15, color: '#fff' },
  preview: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, gap: 6, marginTop: 4 },
  previewTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  previewMeta: { fontSize: 13, color: Colors.textLight },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.primary, marginTop: 8 },
  item: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  saveBtn: { backgroundColor: Colors.secondary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
})

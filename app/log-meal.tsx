import { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Colors } from '../constants/colors'
import { useNutritionStore } from '../store/nutritionStore'
import { useRecipeStore } from '../store/recipeStore'
import { analyzeMealPhoto, parseMealText, analyzeNutrition } from '../services/deepseek'

const TODAY = new Date().toISOString().slice(0, 10)
const MEALS = ['早餐', '午餐', '晚餐', '加餐']
const TABS = [
  { key: 'photo', label: '📷 拍照识别' },
  { key: 'text', label: '✍️ 文字输入' },
  { key: 'recipe', label: '📖 菜谱库' },
]

type MealResult = {
  foods: { name: string; portion: string; calories: number; protein: number; fat: number; carbs: number }[]
  total: { calories: number; protein: number; fat: number; carbs: number }
  summary: string
}

export default function LogMeal() {
  const params = useLocalSearchParams()
  const { addLog } = useNutritionStore()
  const { recipes } = useRecipeStore()

  const [tab, setTab] = useState<'photo' | 'text' | 'recipe'>('photo')
  const [meal, setMeal] = useState(params.meal as string || '午餐')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MealResult | null>(null)
  const [imageUri, setImageUri] = useState<string | null>(null)

  // text tab
  const [textInput, setTextInput] = useState('')

  // recipe tab
  const [recipeSearch, setRecipeSearch] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)

  const filteredRecipes = recipes.filter(r =>
    r.title.includes(recipeSearch) || recipeSearch === ''
  ).slice(0, 20)

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('需要相册权限')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    })
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri)
      analyzePhoto(res.assets[0].base64 || '')
    }
  }

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('需要相机权限')
      return
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    })
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri)
      analyzePhoto(res.assets[0].base64 || '')
    }
  }

  const analyzePhoto = async (base64: string) => {
    if (!base64) return
    setLoading(true)
    setResult(null)
    try {
      const data = await analyzeMealPhoto(base64)
      setResult(data)
    } catch {
      Alert.alert('识别失败', '请重试或换一张更清晰的照片')
    }
    setLoading(false)
  }

  const analyzeText = async () => {
    if (!textInput.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const data = await parseMealText(textInput.trim())
      setResult(data)
    } catch {
      Alert.alert('解析失败', '请重试')
    }
    setLoading(false)
  }

  const selectRecipe = async (title: string) => {
    setSelectedRecipe(title)
    const recipe = recipes.find(r => r.title === title)
    if (!recipe) return
    setLoading(true)
    setResult(null)
    try {
      const cacheKey = `miaopo_nutrition_${title}`
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      const cached = await AsyncStorage.getItem(cacheKey)
      let nutrition: any
      if (cached) {
        nutrition = JSON.parse(cached)
      } else {
        nutrition = await analyzeNutrition(title, recipe.ingredients)
        await AsyncStorage.setItem(cacheKey, JSON.stringify(nutrition))
      }
      setResult({
        foods: [{ name: title, portion: `${recipe.servings || 1}人份`, calories: nutrition.calories, protein: nutrition.protein, fat: nutrition.fat, carbs: nutrition.carbs }],
        total: { calories: nutrition.calories, protein: nutrition.protein, fat: nutrition.fat, carbs: nutrition.carbs },
        summary: title,
      })
    } catch {
      // fallback
      const defaults = { calories: 450, protein: 18, fat: 12, carbs: 60 }
      setResult({
        foods: [{ name: title, portion: '1人份', ...defaults }],
        total: defaults,
        summary: title,
      })
    }
    setLoading(false)
  }

  const confirmLog = async () => {
    if (!result) return
    await addLog({
      date: TODAY,
      meal,
      title: result.summary || result.foods.map(f => f.name).join('、'),
      calories: result.total.calories,
      protein: result.total.protein,
      fat: result.total.fat,
      carbs: result.total.carbs,
    })
    Alert.alert('✅ 已记录', `${meal}已保存到饮食日志`, [
      { text: '继续记录', onPress: () => { setResult(null); setImageUri(null); setTextInput(''); setSelectedRecipe(null) } },
      { text: '返回', onPress: () => router.back() },
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* 餐次选择 */}
      <View style={styles.mealRow}>
        {MEALS.map(m => (
          <TouchableOpacity key={m} style={[styles.mealBtn, meal === m && styles.mealBtnActive]} onPress={() => setMeal(m)}>
            <Text style={[styles.mealBtnText, meal === m && styles.mealBtnTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab 切换 */}
      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => { setTab(t.key as any); setResult(null); setImageUri(null) }}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 拍照识别 */}
      {tab === 'photo' && (
        <View style={styles.card}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImg} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>🍽</Text>
              <Text style={styles.photoPlaceholderText}>拍一张这顿饭的照片</Text>
              <Text style={styles.photoPlaceholderHint}>AI 将自动识别食物和估算营养</Text>
            </View>
          )}
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <Text style={styles.photoBtnText}>📷 拍照</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
              <Text style={styles.photoBtnText}>🖼 相册</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 文字输入 */}
      {tab === 'text' && (
        <View style={styles.card}>
          <Text style={styles.label}>描述这顿饭</Text>
          <TextInput
            style={styles.textArea}
            placeholder="例如：一碗米饭、红烧肉两块、炒青菜一份"
            placeholderTextColor={Colors.textLight}
            value={textInput}
            onChangeText={setTextInput}
            multiline
            numberOfLines={4}
          />
          <TouchableOpacity style={[styles.analyzeBtn, !textInput.trim() && styles.analyzeBtnDisabled]} onPress={analyzeText} disabled={!textInput.trim() || loading}>
            <Text style={styles.analyzeBtnText}>AI 分析营养</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 菜谱库 */}
      {tab === 'recipe' && (
        <View style={styles.card}>
          <Text style={styles.label}>从菜谱库选择</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索菜名..."
            placeholderTextColor={Colors.textLight}
            value={recipeSearch}
            onChangeText={setRecipeSearch}
          />
          {filteredRecipes.length === 0 ? (
            <Text style={styles.emptyText}>没有找到菜谱，先去导入吧</Text>
          ) : (
            filteredRecipes.map(r => (
              <TouchableOpacity
                key={r.id}
                style={[styles.recipeItem, selectedRecipe === r.title && styles.recipeItemSelected]}
                onPress={() => selectRecipe(r.title)}
              >
                <Text style={[styles.recipeItemText, selectedRecipe === r.title && styles.recipeItemTextSelected]}>{r.title}</Text>
                <Text style={styles.recipeItemMeta}>{r.ingredients.length}种食材</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* 加载中 */}
      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>AI 分析中...</Text>
        </View>
      )}

      {/* 结果 */}
      {result && !loading && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>📊 营养分析结果</Text>
          {result.summary ? <Text style={styles.resultSummary}>{result.summary}</Text> : null}

          {result.foods.map((f, i) => (
            <View key={i} style={styles.foodRow}>
              <View style={styles.foodName}>
                <Text style={styles.foodNameText}>{f.name}</Text>
                <Text style={styles.foodPortion}>{f.portion}</Text>
              </View>
              <Text style={styles.foodCal}>{f.calories}千卡</Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <MacroBox label="热量" value={result.total.calories} unit="千卡" color={Colors.primary} />
            <MacroBox label="蛋白质" value={result.total.protein} unit="g" color="#28a745" />
            <MacroBox label="脂肪" value={result.total.fat} unit="g" color="#fd7e14" />
            <MacroBox label="碳水" value={result.total.carbs} unit="g" color="#6f42c1" />
          </View>

          <TouchableOpacity style={styles.confirmBtn} onPress={confirmLog}>
            <Text style={styles.confirmBtnText}>✅ 记录到{meal}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

function MacroBox({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={styles.macroBox}>
      <Text style={[styles.macroValue, { color }]}>{value}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  mealRow: { flexDirection: 'row', gap: 8 },
  mealBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.card, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  mealBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  mealBtnText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  mealBtnTextActive: { color: '#fff' },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary + '20' },
  tabText: { fontSize: 12, color: Colors.textLight },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  photoPlaceholder: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  photoPlaceholderIcon: { fontSize: 56 },
  photoPlaceholderText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  photoPlaceholderHint: { fontSize: 13, color: Colors.textLight },
  previewImg: { width: '100%', height: 200, borderRadius: 12, resizeMode: 'cover' },
  photoActions: { flexDirection: 'row', gap: 10 },
  photoBtn: { flex: 1, backgroundColor: Colors.primary + '15', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '40' },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  textArea: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.text, minHeight: 100, textAlignVertical: 'top' },
  analyzeBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  analyzeBtnDisabled: { opacity: 0.4 },
  analyzeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  searchInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingVertical: 16 },
  recipeItem: { paddingVertical: 12, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  recipeItemSelected: { backgroundColor: Colors.primary + '12', borderRadius: 8, paddingHorizontal: 8 },
  recipeItemText: { fontSize: 15, color: Colors.text },
  recipeItemTextSelected: { color: Colors.primary, fontWeight: '700' },
  recipeItemMeta: { fontSize: 12, color: Colors.textLight },
  loadingBox: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  loadingText: { fontSize: 14, color: Colors.textLight },
  resultCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  resultTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  resultSummary: { fontSize: 13, color: Colors.textLight, lineHeight: 20 },
  foodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  foodName: { flex: 1, gap: 2 },
  foodNameText: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  foodPortion: { fontSize: 12, color: Colors.textLight },
  foodCal: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.background, borderRadius: 12, padding: 12 },
  macroBox: { alignItems: 'center', gap: 2 },
  macroValue: { fontSize: 20, fontWeight: '800' },
  macroUnit: { fontSize: 10, color: Colors.textLight },
  macroLabel: { fontSize: 11, color: Colors.textLight },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})

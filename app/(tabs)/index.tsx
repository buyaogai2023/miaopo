import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRecipeStore } from '../../store/recipeStore'
import { useFamilyStore } from '../../store/familyStore'
import { useNutritionStore } from '../../store/nutritionStore'
import { useShoppingStore } from '../../store/shoppingStore'
import { Colors } from '../../constants/colors'
import { Recipe } from '../../types'
import { generateHealthyRecommendation, analyzeNutrition } from '../../services/deepseek'

interface DailyRec {
  meal: string; title: string; reason: string; nutrition_highlight: string
  missing_ingredients: string[]
}

const TODAY = new Date().toISOString().slice(0, 10)
const REC_KEY = `miaopo_daily_rec_${TODAY}`
const MEAL_ICON: Record<string, string> = { '早餐': '🌅', '午餐': '☀️', '晚餐': '🌙' }

export default function RecipeLibrary() {
  const { recipes, loading, fetchRecipes } = useRecipeStore()
  const { members, load: loadFamily } = useFamilyStore()
  const { loadLogs, loadFeedbacks, addLog, addFeedback, getTodayLogs, getWeekLogs, getLikedTitles, getDislikedTitles } = useNutritionStore()
  const { addMissingItems } = useShoppingStore()
  const [recs, setRecs] = useState<DailyRec[]>([])
  const [recLoading, setRecLoading] = useState(false)
  const [hasHealth, setHasHealth] = useState(false)
  const [eaten, setEaten] = useState<Record<string, boolean>>({})
  const [eating, setEating] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState<Record<string, boolean>>({}) // title → shopping loading
  const [todayCalories, setTodayCalories] = useState(0)
  const [fridgeNames, setFridgeNames] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchRecipes()
    Promise.all([loadFamily(), loadLogs(), loadFeedbacks()]).then(() => {
      loadRecs()
      refreshTodayCalories()
    })
    AsyncStorage.getItem('miaopo_fridge').then(raw => {
      const fridge = raw ? JSON.parse(raw) : []
      setFridgeNames(new Set(fridge.map((i: any) => i.name)))
    })
  }, [])

  const refreshTodayCalories = () => {
    const total = getTodayLogs().reduce((s, l) => s + l.calories, 0)
    setTodayCalories(total)
  }

  const loadRecs = useCallback(async () => {
    const cached = await AsyncStorage.getItem(REC_KEY)
    if (cached) { setRecs(JSON.parse(cached)); return }
    await generateRecs()
  }, [])

  const generateRecs = async () => {
    const fam = useFamilyStore.getState().members
    const withHealth = fam.filter(m => m.health && Object.keys(m.health).length > 0)
    setHasHealth(withHealth.length > 0)
    if (withHealth.length === 0) return
    setRecLoading(true)
    try {
      const fridgeRaw = await AsyncStorage.getItem('miaopo_fridge')
      const fridge: any[] = fridgeRaw ? JSON.parse(fridgeRaw) : []
      setFridgeNames(new Set(fridge.map(i => i.name)))
      const profiles = fam.map(m => ({ name: m.name, health: m.health, tastes: m.tastes }))
      const liked = getLikedTitles()
      const disliked = getDislikedTitles()
      // 最近7天吃过的菜（去重用）
      const recentMeals = [...new Set(getWeekLogs().map(l => l.title))]
      const result = await generateHealthyRecommendation(
        profiles, fridge.map(i => i.name), liked, disliked, recentMeals
      )
      if (Array.isArray(result) && result.length) {
        setRecs(result)
        await AsyncStorage.setItem(REC_KEY, JSON.stringify(result))
      }
    } catch {}
    setRecLoading(false)
  }

  // 省Token：营养按菜名缓存，避免重复调用AI
  const getCachedNutrition = async (title: string, ingredients: any[]) => {
    const cacheKey = `miaopo_nutrition_${title}`
    const cached = await AsyncStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
    // 库里有菜谱才调AI，否则用估算值
    if (ingredients.length > 0) {
      const result = await analyzeNutrition(title, ingredients)
      await AsyncStorage.setItem(cacheKey, JSON.stringify(result))
      return result
    }
    // 按餐次估算默认值（不调AI）
    const defaults: Record<string, any> = {
      '早餐': { calories: 350, protein: 12, fat: 8, carbs: 55 },
      '午餐': { calories: 550, protein: 20, fat: 15, carbs: 70 },
      '晚餐': { calories: 450, protein: 18, fat: 12, carbs: 60 },
    }
    return defaults['午餐']
  }

  const markEaten = async (rec: DailyRec) => {
    if (eaten[rec.title] || eating[rec.title]) return
    setEating(e => ({ ...e, [rec.title]: true }))
    try {
      const ingredients = recipes.find(r => r.title === rec.title)?.ingredients || []
      const nutrition = await getCachedNutrition(rec.title, ingredients)
      await addLog({
        date: TODAY, meal: rec.meal, title: rec.title,
        calories: nutrition.calories, protein: nutrition.protein,
        fat: nutrition.fat, carbs: nutrition.carbs,
      })
      setEaten(e => ({ ...e, [rec.title]: true }))
      setTodayCalories(c => c + nutrition.calories)
    } catch {
      await addLog({ date: TODAY, meal: rec.meal, title: rec.title, calories: 400, protein: 15, fat: 12, carbs: 45 })
      setEaten(e => ({ ...e, [rec.title]: true }))
      setTodayCalories(c => c + 400)
    }
    setEating(e => ({ ...e, [rec.title]: false }))
  }

  const handleAddToShopping = async (rec: DailyRec) => {
    if (!rec.missing_ingredients?.length) {
      Alert.alert('✅ 冰箱食材齐全', '不需要购买额外食材')
      return
    }
    setAdding(a => ({ ...a, [rec.title]: true }))
    const count = await addMissingItems(rec.missing_ingredients)
    setAdding(a => ({ ...a, [rec.title]: false }))
    Alert.alert(
      count > 0 ? `✅ 已加入购物清单` : '购物清单已有这些食材',
      count > 0 ? `${rec.missing_ingredients.join('、')} 已添加` : '无需重复添加'
    )
  }

  const handleFeedback = async (title: string, liked: boolean) => {
    await addFeedback(title, liked)
  }

  // 冰箱匹配状态
  const getFridgeMatch = (rec: DailyRec) => {
    const missing = rec.missing_ingredients || []
    if (missing.length === 0) return { text: '✅ 冰箱食材齐全', color: '#28a745' }
    return { text: `⚠️ 缺：${missing.slice(0, 3).join('、')}${missing.length > 3 ? '等' : ''}`, color: '#E65100' }
  }

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/recipe/${item.id}`)}>
      <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.meta}>
        {item.ingredients.length}种食材
        {item.cook_time ? ` · ${item.cook_time}分钟` : ''}
        {item.servings ? ` · ${item.servings}人份` : ''}
      </Text>
    </TouchableOpacity>
  )

  const Header = () => (
    <>
      <TouchableOpacity style={styles.chefBanner} onPress={() => router.push('/chef')}>
        <Text style={styles.chefIcon}>👨‍🍳</Text>
        <View style={styles.chefInfo}>
          <Text style={styles.chefTitle}>问妙妙大厨</Text>
          <Text style={styles.chefSub}>今天吃什么？让 AI 帮你决定</Text>
        </View>
        <Text style={styles.chefArrow}>→</Text>
      </TouchableOpacity>

      {/* 今日摄入摘要 */}
      <View style={styles.calorieBanner}>
        <TouchableOpacity onPress={() => router.push('/health-report')} style={{ flex: 1 }}>
          <Text style={styles.calorieText}>{todayCalories > 0 ? `🔥 今日已摄入 ${todayCalories} 千卡` : '📋 记录今日饮食'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logMealBtn} onPress={() => router.push('/log-meal')}>
          <Text style={styles.logMealBtnText}>+ 记录</Text>
        </TouchableOpacity>
      </View>

      {/* 今日健康推荐 */}
      <View style={styles.recCard}>
        <View style={styles.recHeader}>
          <Text style={styles.recTitle}>🌟 今日全家健康推荐</Text>
          <TouchableOpacity onPress={() => { AsyncStorage.removeItem(REC_KEY); setRecs([]); generateRecs() }} disabled={recLoading}>
            <Text style={styles.recRefresh}>{recLoading ? '生成中...' : '🔄 刷新'}</Text>
          </TouchableOpacity>
        </View>

        {recLoading ? (
          <View style={styles.recLoading}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.recLoadingText}>AI 分析全家健康数据中...</Text>
          </View>
        ) : !hasHealth && recs.length === 0 ? (
          <TouchableOpacity style={styles.recEmpty} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.recEmptyText}>完善健康档案，获取个性化推荐 →</Text>
          </TouchableOpacity>
        ) : recs.length === 0 ? (
          <View style={styles.recEmpty}>
            <Text style={styles.recEmptyText}>点击右上角刷新生成今日推荐</Text>
          </View>
        ) : (
          recs.map((r, i) => (
            <View key={i} style={[styles.recItem, i < recs.length - 1 && styles.recItemBorder]}>
              <Text style={styles.recMealIcon}>{MEAL_ICON[r.meal] || '🍽'}</Text>
              <View style={styles.recItemInfo}>
                <View style={styles.recItemTop}>
                  <Text style={styles.recMeal}>{r.meal}</Text>
                  <Text style={styles.recDish}>{r.title}</Text>
                </View>
                <Text style={styles.recHighlight} numberOfLines={1}>✨ {r.nutrition_highlight}</Text>
                <Text style={styles.recReason} numberOfLines={1}>{r.reason}</Text>
                {/* 冰箱匹配状态 */}
                {(() => { const m = getFridgeMatch(r); return (
                  <Text style={[styles.fridgeMatch, { color: m.color }]} numberOfLines={1}>{m.text}</Text>
                )})()}
                {/* 操作按钮 */}
                <View style={styles.recActions}>
                  <TouchableOpacity
                    style={[styles.eatBtn, eaten[r.title] && styles.eatBtnDone]}
                    onPress={() => markEaten(r)}
                    disabled={!!eaten[r.title]}
                  >
                    {eating[r.title]
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={[styles.eatBtnText, eaten[r.title] && styles.eatBtnTextDone]}>
                          {eaten[r.title] ? '✅ 已吃' : '🍽 已吃'}
                        </Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.shopBtn, !r.missing_ingredients?.length && styles.shopBtnDone]}
                    onPress={() => handleAddToShopping(r)}
                    disabled={!!adding[r.title]}
                  >
                    {adding[r.title]
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={styles.shopBtnText}>
                          {(r.missing_ingredients?.length ?? 0) === 0 ? '🧊 食材齐全' : '🛒 加购物单'}
                        </Text>}
                  </TouchableOpacity>
                  <View style={styles.feedbackBtns}>
                    <TouchableOpacity onPress={() => handleFeedback(r.title, true)}>
                      <Text style={styles.feedbackIcon}>👍</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleFeedback(r.title, false)}>
                      <Text style={styles.feedbackIcon}>👎</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 周报入口 */}
      <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/health-report')}>
        <Text style={styles.reportBtnText}>📊 查看健康周报</Text>
      </TouchableOpacity>

      <Text style={styles.libraryLabel}>我的菜谱库</Text>
    </>
  )

  return (
    <View style={styles.container}>
      {loading && recipes.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipe}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Header />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🍳</Text>
              <Text style={styles.emptyText}>还没有菜谱</Text>
              <Text style={styles.emptyHint}>点击下方「导入」添加第一个菜谱</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRecipes} tintColor={Colors.primary} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  chefBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 8, backgroundColor: '#1A1A2E', borderRadius: 16, padding: 16 },
  chefIcon: { fontSize: 32 },
  chefInfo: { flex: 1 },
  chefTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  chefSub: { fontSize: 13, color: '#ffffff80', marginTop: 2 },
  chefArrow: { fontSize: 18, color: Colors.primary },
  calorieBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF3E0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  calorieText: { fontSize: 14, fontWeight: '600', color: '#E65100' },
  calorieLink: { fontSize: 13, color: Colors.primary },
  logMealBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  logMealBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  recCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  recHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  recTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  recRefresh: { fontSize: 13, color: Colors.primary },
  recLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, justifyContent: 'center' },
  recLoadingText: { fontSize: 13, color: Colors.textLight },
  recEmpty: { padding: 16, alignItems: 'center' },
  recEmptyText: { fontSize: 14, color: Colors.primary },
  recItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  recItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  recMealIcon: { fontSize: 22, marginTop: 2 },
  recItemInfo: { flex: 1, gap: 3 },
  recItemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recMeal: { fontSize: 11, color: Colors.textLight, width: 30 },
  recDish: { fontSize: 15, fontWeight: '700', color: Colors.text },
  recHighlight: { fontSize: 12, color: '#28a745' },
  recReason: { fontSize: 12, color: Colors.textLight },
  recActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  eatBtn: { backgroundColor: Colors.primary + '15', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '40', minWidth: 68, alignItems: 'center' },
  eatBtnDone: { backgroundColor: '#28a74520', borderColor: '#28a74540' },
  eatBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  eatBtnTextDone: { color: '#28a745' },
  fridgeMatch: { fontSize: 11, fontWeight: '600' },
  shopBtn: { backgroundColor: Colors.primary + '15', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '40' },
  shopBtnDone: { backgroundColor: '#28a74510', borderColor: '#28a74540' },
  shopBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  importBtn: { backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  importBtnText: { fontSize: 12, color: Colors.textLight },
  feedbackBtns: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  feedbackIcon: { fontSize: 18 },
  reportBtn: { marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  reportBtnText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  libraryLabel: { fontSize: 13, fontWeight: '600', color: Colors.textLight, marginHorizontal: 16, marginBottom: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  list: { paddingBottom: 100 },
  card: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, gap: 6, marginHorizontal: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  title: { fontSize: 17, fontWeight: '600', color: Colors.text },
  meta: { fontSize: 13, color: Colors.textLight },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  emptyHint: { fontSize: 14, color: Colors.textLight, marginTop: 8 },
})

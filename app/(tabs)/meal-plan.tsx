import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, FlatList, ActivityIndicator } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Colors } from '../../constants/colors'
import { MealPlan, Recipe } from '../../types'
import { generateWeeklyMealPlan } from '../../services/deepseek'
import { useFamilyStore } from '../../store/familyStore'

const STORAGE_KEY = 'miaopo_mealplan'
const MEAL_TYPES: MealPlan['meal_type'][] = ['早餐', '午餐', '晚餐']

function getWeekDates() {
  const today = new Date()
  const day = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - day + 1)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

export default function MealPlanScreen() {
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [weekDates] = useState(getWeekDates())
  const [selecting, setSelecting] = useState<{ date: string; meal: MealPlan['meal_type'] } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const { myTastes, load: loadFamily } = useFamilyStore()

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => setPlans(raw ? JSON.parse(raw) : []))
    AsyncStorage.getItem('miaopo_recipes').then(raw => setRecipes(raw ? JSON.parse(raw) : []))
    loadFamily()
  }, [])

  const savePlans = async (newPlans: MealPlan[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPlans))
    setPlans(newPlans)
  }

  const getPlan = (date: string, meal: MealPlan['meal_type']) =>
    plans.find(p => p.date === date && p.meal_type === meal)

  const selectRecipe = async (recipe: Recipe) => {
    if (!selecting) return
    const newPlan: MealPlan = { id: Date.now().toString(), date: selecting.date, meal_type: selecting.meal, recipe_id: recipe.id, recipe_title: recipe.title }
    const updated = plans.filter(p => !(p.date === selecting.date && p.meal_type === selecting.meal))
    await savePlans([...updated, newPlan])
    setSelecting(null)
  }

  const removePlan = (date: string, meal: MealPlan['meal_type']) => {
    Alert.alert('删除', '确定删除这个餐计划？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => savePlans(plans.filter(p => !(p.date === date && p.meal_type === meal))) }
    ])
  }

  const aiGenerateWeek = async () => {
    Alert.alert('AI生成一周菜单', '将根据您的冰箱食材和口味偏好，自动安排一周三餐。', [
      { text: '取消', style: 'cancel' },
      {
        text: '生成', onPress: async () => {
          setAiLoading(true)
          try {
            const fridgeRaw = await AsyncStorage.getItem('miaopo_fridge')
            const fridge: any[] = fridgeRaw ? JSON.parse(fridgeRaw) : []
            const fridgeNames = fridge.map((i: any) => i.name)
            const tastes = myTastes()
            const result = await generateWeeklyMealPlan(fridgeNames, tastes, weekDates)
            if (!Array.isArray(result) || !result.length) throw new Error('生成失败')
            const newPlans: MealPlan[] = result.map((r: any) => ({
              id: Date.now().toString() + Math.random(),
              date: r.date,
              meal_type: r.meal_type as MealPlan['meal_type'],
              recipe_id: '',
              recipe_title: r.recipe_title,
            }))
            // 保留手动设置的，合并AI生成的
            const merged = [...plans]
            for (const p of newPlans) {
              const exists = merged.find(m => m.date === p.date && m.meal_type === p.meal_type)
              if (!exists) merged.push(p)
            }
            await savePlans(merged)
            Alert.alert('完成', '一周菜单已生成！长按可删除单个计划')
          } catch (e: any) {
            Alert.alert('生成失败', e?.message || '请重试')
          } finally {
            setAiLoading(false)
          }
        }
      }
    ])
  }

  const addToShopping = async () => {
    const shoppingRaw = await AsyncStorage.getItem('miaopo_shopping')
    const shopping = shoppingRaw ? JSON.parse(shoppingRaw) : []
    const recipeIds = new Set(plans.map(p => p.recipe_id).filter(Boolean))
    let added = 0
    for (const id of recipeIds) {
      const recipe = recipes.find(r => r.id === id)
      if (!recipe) continue
      for (const ing of recipe.ingredients) {
        shopping.unshift({ id: Date.now().toString() + Math.random(), name: ing.name, amount: ing.amount, category: '其他', checked: false, created_at: new Date().toISOString(), user_id: '' })
        added++
      }
    }
    await AsyncStorage.setItem('miaopo_shopping', JSON.stringify(shopping))
    Alert.alert('已添加', `${added} 个食材已加入购物清单`)
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.aiBtn} onPress={aiGenerateWeek} disabled={aiLoading}>
          {aiLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.aiBtnText}>✨ AI生成一周菜单</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {weekDates.map((date, idx) => (
          <View key={date} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayName}>周{DAY_NAMES[idx]}</Text>
              <Text style={styles.dayDate}>{date.slice(5)}</Text>
            </View>
            {MEAL_TYPES.map(meal => {
              const plan = getPlan(date, meal)
              return (
                <TouchableOpacity
                  key={meal}
                  style={styles.mealRow}
                  onPress={() => setSelecting({ date, meal })}
                  onLongPress={() => plan && removePlan(date, meal)}
                >
                  <Text style={styles.mealType}>{meal}</Text>
                  {plan
                    ? <Text style={styles.mealTitle} numberOfLines={1}>{plan.recipe_title}</Text>
                    : <Text style={styles.mealEmpty}>+ 选择菜谱</Text>}
                </TouchableOpacity>
              )
            })}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.shoppingBtn} onPress={addToShopping}>
        <Text style={styles.shoppingBtnText}>🛒 一键生成购物清单</Text>
      </TouchableOpacity>

      <Modal visible={!!selecting} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelecting(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>选择菜谱</Text>
            <TouchableOpacity onPress={() => setSelecting(null)}>
              <Text style={styles.modalClose}>关闭</Text>
            </TouchableOpacity>
          </View>
          {recipes.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>还没有菜谱，先去导入吧</Text></View>
          ) : (
            <FlatList
              data={recipes}
              keyExtractor={r => r.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.recipeItem} onPress={() => selectRecipe(item)}>
                  <Text style={styles.recipeTitle}>{item.title}</Text>
                  <Text style={styles.recipeMeta}>{item.ingredients.length}种食材{item.cook_time ? ` · ${item.cook_time}分钟` : ''}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { padding: 16, paddingBottom: 0 },
  aiBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  aiBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  dayCard: { backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: Colors.primary + '15' },
  dayName: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  dayDate: { fontSize: 13, color: Colors.textLight },
  mealRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, gap: 12 },
  mealType: { fontSize: 13, color: Colors.textLight, width: 32 },
  mealTitle: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '500' },
  mealEmpty: { flex: 1, fontSize: 14, color: Colors.textLight },
  shoppingBtn: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: Colors.secondary, borderRadius: 14, padding: 16, alignItems: 'center' },
  shoppingBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  modalClose: { fontSize: 16, color: Colors.primary },
  recipeItem: { backgroundColor: Colors.card, borderRadius: 10, padding: 14 },
  recipeTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  recipeMeta: { fontSize: 13, color: Colors.textLight, marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: Colors.textLight },
})

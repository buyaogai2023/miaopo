import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useRecipeStore } from '../../store/recipeStore'
import { useShoppingStore } from '../../store/shoppingStore'
import { Colors } from '../../constants/colors'
import { Recipe } from '../../types'
import { analyzeNutrition } from '../../services/deepseek'

interface Nutrition {
  calories: number
  protein: number
  fat: number
  carbs: number
  score: number
  tags: string[]
  tips: string
}

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { recipes, deleteRecipe } = useRecipeStore()
  const { addItem } = useShoppingStore()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [nutrition, setNutrition] = useState<Nutrition | null>(null)
  const [nutritionLoading, setNutritionLoading] = useState(false)
  const [showNutrition, setShowNutrition] = useState(false)

  useEffect(() => {
    const found = recipes.find(r => r.id === id)
    if (found) setRecipe(found)
  }, [id, recipes])

  if (!recipe) return <View style={styles.center}><Text style={{ color: Colors.textLight }}>菜谱不存在</Text></View>

  const handleDelete = () => Alert.alert('删除菜谱', '确定删除这个菜谱吗？', [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: async () => { await deleteRecipe(id); router.back() } }
  ])

  const addAllToShopping = async () => {
    for (const ing of recipe.ingredients) await addItem(ing.name, ing.amount, '其他')
    Alert.alert('已添加', '所有食材已加入购物清单')
  }

  const loadNutrition = async () => {
    setShowNutrition(true)
    if (nutrition) return
    setNutritionLoading(true)
    try {
      const result = await analyzeNutrition(recipe.title, recipe.ingredients)
      setNutrition(result)
    } catch {
      Alert.alert('分析失败', '请重试')
    } finally {
      setNutritionLoading(false)
    }
  }

  const scoreColor = nutrition
    ? nutrition.score >= 80 ? '#28a745' : nutrition.score >= 60 ? '#ffc107' : '#dc3545'
    : Colors.primary

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{recipe.title}</Text>
      <View style={styles.metaRow}>
        {recipe.cook_time && <Text style={styles.meta}>⏱ {recipe.cook_time}分钟</Text>}
        {recipe.servings && <Text style={styles.meta}>👥 {recipe.servings}人份</Text>}
        <Text style={styles.meta}>🥘 {recipe.ingredients.length}种食材</Text>
      </View>

      <TouchableOpacity style={styles.cookBtn} onPress={() => router.push(`/cook/${recipe.id}`)}>
        <Text style={styles.cookBtnText}>👨‍🍳 开始烹饪</Text>
      </TouchableOpacity>

      {/* 营养分析 */}
      <TouchableOpacity style={styles.nutritionToggle} onPress={loadNutrition}>
        <Text style={styles.nutritionToggleText}>🥗 营养分析</Text>
        <Text style={styles.nutritionToggleArrow}>{showNutrition ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {showNutrition && (
        <View style={styles.nutritionCard}>
          {nutritionLoading ? (
            <View style={styles.nutritionLoading}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.nutritionLoadingText}>AI 正在分析营养成分...</Text>
            </View>
          ) : nutrition ? (
            <>
              <View style={styles.scoreRow}>
                <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
                  <Text style={[styles.scoreNum, { color: scoreColor }]}>{nutrition.score}</Text>
                  <Text style={styles.scoreLabel}>健康分</Text>
                </View>
                <View style={styles.macros}>
                  <MacroRow label="热量" value={`${nutrition.calories} kcal`} color="#FF6B6B" />
                  <MacroRow label="蛋白质" value={`${nutrition.protein}g`} color="#4ECDC4" />
                  <MacroRow label="脂肪" value={`${nutrition.fat}g`} color="#FFE66D" />
                  <MacroRow label="碳水" value={`${nutrition.carbs}g`} color="#A8E6CF" />
                </View>
              </View>
              {nutrition.tags.length > 0 && (
                <View style={styles.tagRow}>
                  {nutrition.tags.map(t => (
                    <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
                  ))}
                </View>
              )}
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>💡 {nutrition.tips}</Text>
              </View>
            </>
          ) : null}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>食材</Text>
          <TouchableOpacity onPress={addAllToShopping}>
            <Text style={styles.addBtn}>+ 加入购物清单</Text>
          </TouchableOpacity>
        </View>
        {recipe.ingredients.map((ing, i) => (
          <View key={i} style={styles.ingredientRow}>
            <Text style={styles.ingredientName}>{ing.name}</Text>
            <Text style={styles.ingredientAmount}>{ing.amount}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>步骤</Text>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={styles.deleteBtnText}>删除菜谱</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function MacroRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.macroRow}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text },
  metaRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  meta: { fontSize: 14, color: Colors.textLight },
  cookBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  cookBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  nutritionToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, padding: 14 },
  nutritionToggleText: { fontSize: 15, fontWeight: '600', color: '#2E7D32' },
  nutritionToggleArrow: { fontSize: 12, color: '#2E7D32' },
  nutritionCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 14 },
  nutritionLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', padding: 12 },
  nutritionLoadingText: { fontSize: 14, color: Colors.textLight },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  scoreNum: { fontSize: 24, fontWeight: '800' },
  scoreLabel: { fontSize: 11, color: Colors.textLight },
  macros: { flex: 1, gap: 6 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { fontSize: 13, color: Colors.textLight, width: 44 },
  macroValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: Colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  tipBox: { backgroundColor: '#F0F7FF', borderRadius: 10, padding: 12 },
  tipText: { fontSize: 13, color: '#1565C0', lineHeight: 20 },
  section: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  addBtn: { fontSize: 13, color: Colors.primary },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ingredientName: { fontSize: 15, color: Colors.text },
  ingredientAmount: { fontSize: 15, color: Colors.textLight },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  stepNumText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  stepText: { flex: 1, fontSize: 15, color: Colors.text, lineHeight: 22 },
  deleteBtn: { borderWidth: 1, borderColor: Colors.error, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { fontSize: 15, color: Colors.error },
})

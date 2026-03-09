import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Colors } from '../constants/colors'
import { suggestRecipesByIngredients } from '../services/deepseek'
import { useFamilyStore } from '../store/familyStore'

interface SuggestedRecipe {
  title: string
  reason: string
  missing: string[]
  match_score?: number
}

export default function SuggestScreen() {
  const { ingredients } = useLocalSearchParams<{ ingredients: string }>()
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const { myTastes, load: loadFamily } = useFamilyStore()

  useEffect(() => {
    if (!ingredients) return
    loadFamily().then(async () => {
      const tastes = myTastes()
      const mealRaw = await AsyncStorage.getItem('miaopo_mealplan')
      const history: string[] = mealRaw
        ? JSON.parse(mealRaw).map((p: any) => p.recipe_title).filter(Boolean)
        : []
      suggestRecipesByIngredients(ingredients.split(','), tastes, history)
        .then(result => { setSuggestions(result); setLoading(false) })
        .catch(() => setLoading(false))
    })
  }, [ingredients])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>为你个性化推荐</Text>
      <Text style={styles.sub}>现有：{ingredients?.split(',').join('、')}</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>AI 正在分析冰箱食材和口味偏好...</Text>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/import', params: { prefill: item.title } })}
            >
              <View style={styles.cardTop}>
                <Text style={styles.title}>{item.title}</Text>
                {item.match_score != null && (
                  <View style={[styles.scoreBadge, item.match_score >= 80 ? styles.scoreHigh : styles.scoreMed]}>
                    <Text style={styles.scoreText}>{item.match_score}分</Text>
                  </View>
                )}
              </View>
              <Text style={styles.reason}>{item.reason}</Text>
              {item.missing.length > 0 && (
                <Text style={styles.missing}>还需要：{item.missing.join('、')}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { fontSize: 18, fontWeight: '700', color: Colors.text, padding: 20, paddingBottom: 4 },
  sub: { fontSize: 13, color: Colors.textLight, paddingHorizontal: 20, paddingBottom: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: Colors.textLight, textAlign: 'center', paddingHorizontal: 40 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  scoreHigh: { backgroundColor: '#28a74520' },
  scoreMed: { backgroundColor: Colors.primary + '20' },
  scoreText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  reason: { fontSize: 14, color: Colors.textLight, lineHeight: 20 },
  missing: { fontSize: 13, color: Colors.primary, marginTop: 4 },
})

import { useEffect, useState } from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Stack, router, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-url-polyfill/auto'
import { supabase } from '../services/supabase'
import FloatingChef from '../components/FloatingChef'
import { useFamilyStore } from '../store/familyStore'

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const loadFamily = useFamilyStore(s => s.load)
  const onboarding = useFamilyStore(s => s.onboarding)
  const pathname = usePathname()
  const showImportFab = ['/', '/fridge', '/meal-plan', '/shopping', '/profile'].includes(pathname)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) await supabase.auth.signInAnonymously()
      await loadFamily()
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready && !onboarding?.completed) {
      router.replace('/onboarding')
    }
  }, [ready, onboarding])

  if (!ready) return null

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '菜谱详情', headerBackTitle: '返回' }} />
        <Stack.Screen name="cook/[id]" options={{ title: '烹饪模式', headerBackTitle: '返回', headerStyle: { backgroundColor: '#1A1A1A' }, headerTintColor: '#fff', headerTitleStyle: { color: '#fff' } }} />
        <Stack.Screen name="suggest" options={{ title: 'AI推荐菜谱', headerBackTitle: '返回' }} />
        <Stack.Screen name="chef" options={{ title: '妙妙大厨', headerBackTitle: '返回', headerStyle: { backgroundColor: '#1A1A2E' }, headerTintColor: '#fff', headerTitleStyle: { color: '#fff' } }} />
        <Stack.Screen name="health-report" options={{ title: '健康周报', headerBackTitle: '返回' }} />
        <Stack.Screen name="log-meal" options={{ title: '记录用餐', headerBackTitle: '返回' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ title: '收录菜谱', headerBackTitle: '返回' }} />
      </Stack>
      <FloatingChef />
      {showImportFab && (
        <TouchableOpacity style={styles.importFab} onPress={() => router.push('/import')} activeOpacity={0.85}>
          <Text style={styles.importFabIcon}>🎬</Text>
          <Text style={styles.importFabLabel}>收录</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  importFab: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
  importFabIcon: { fontSize: 24 },
  importFabLabel: { fontSize: 10, color: '#fff', fontWeight: '700', marginTop: 1 },
})

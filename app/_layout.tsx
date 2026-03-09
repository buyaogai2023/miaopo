import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-url-polyfill/auto'
import { supabase } from '../services/supabase'
import FloatingChef from '../components/FloatingChef'

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) await supabase.auth.signInAnonymously()
      setReady(true)
    })
  }, [])

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
      </Stack>
      <FloatingChef />
    </View>
  )
}

import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { Colors } from '../../constants/colors'

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textLight,
      tabBarStyle: { backgroundColor: Colors.card, height: 60, paddingBottom: 6 },
      headerStyle: { backgroundColor: Colors.card },
      headerTitleStyle: { color: Colors.text, fontWeight: 'bold' },
    }}>
      <Tabs.Screen name="index" options={{
        title: '菜谱库',
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>📖</Text>,
      }} />
      <Tabs.Screen name="fridge" options={{
        title: '冰箱',
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧊</Text>,
      }} />
      <Tabs.Screen name="meal-plan" options={{
        title: '餐计划',
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text>,
      }} />
      <Tabs.Screen name="shopping" options={{
        title: '购物',
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>🛒</Text>,
      }} />
      <Tabs.Screen name="profile" options={{
        title: '我的',
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text>,
      }} />
    </Tabs>
  )
}

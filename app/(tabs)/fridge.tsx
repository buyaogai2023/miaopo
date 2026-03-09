import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { Colors } from '../../constants/colors'
import { FridgeItem } from '../../types'
import { recognizeFridgeItems } from '../../services/deepseek'

const STORAGE_KEY = 'miaopo_fridge'

function daysUntilExpiry(expire_date?: string): number | null {
  if (!expire_date) return null
  const diff = new Date(expire_date).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function ExpiryBadge({ expire_date }: { expire_date?: string }) {
  const days = daysUntilExpiry(expire_date)
  if (days === null) return null
  if (days < 0) return <Text style={[styles.badge, styles.badgeExpired]}>已过期</Text>
  if (days === 0) return <Text style={[styles.badge, styles.badgeToday]}>今天到期</Text>
  if (days <= 3) return <Text style={[styles.badge, styles.badgeSoon]}>还剩{days}天</Text>
  return <Text style={[styles.badge, styles.badgeOk]}>还剩{days}天</Text>
}

export default function FridgeScreen() {
  const [items, setItems] = useState<FridgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newExpire, setNewExpire] = useState('')

  useEffect(() => { loadItems() }, [])

  const loadItems = async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    setItems(raw ? JSON.parse(raw) : [])
  }

  const saveItems = async (newItems: FridgeItem[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newItems))
    setItems(newItems)
  }

  const takePicture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) { Alert.alert('需要权限', '请允许妙谱使用相机'); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
    if (result.canceled || !result.assets[0].base64) return
    setLoading(true)
    try {
      const recognized = await recognizeFridgeItems(result.assets[0].base64)
      const newItems = [...items]
      for (const item of recognized) {
        newItems.unshift({ ...item, id: Date.now().toString() + Math.random(), added_at: new Date().toISOString() })
      }
      await saveItems(newItems)
      Alert.alert('识别成功', `已添加 ${recognized.length} 种食材`)
    } catch {
      Alert.alert('识别失败', '请重新拍照或手动添加')
    } finally {
      setLoading(false)
    }
  }

  const addManually = async () => {
    if (!newName.trim()) return
    const item: FridgeItem = {
      id: Date.now().toString(),
      name: newName.trim(),
      amount: newAmount.trim() || '适量',
      expire_date: newExpire.trim() || undefined,
      added_at: new Date().toISOString(),
    }
    await saveItems([item, ...items])
    setNewName(''); setNewAmount(''); setNewExpire(''); setAdding(false)
  }

  const deleteItem = (id: string) => {
    Alert.alert('删除', '确定删除这个食材？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => saveItems(items.filter(i => i.id !== id)) }
    ])
  }

  const expiringSoon = items.filter(i => {
    const d = daysUntilExpiry(i.expire_date)
    return d !== null && d <= 3
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.cameraBtn} onPress={takePicture} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.cameraBtnText}>📷 拍照识别食材</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.suggestBtn} onPress={() => {
          if (items.length === 0) { Alert.alert('提示', '冰箱是空的，先添加食材'); return }
          router.push({ pathname: '/suggest', params: { ingredients: items.map(i => i.name).join(',') } })
        }}>
          <Text style={styles.suggestBtnText}>✨ 推荐</Text>
        </TouchableOpacity>
      </View>

      {expiringSoon.length > 0 && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>⚠️ 即将过期：{expiringSoon.map(i => i.name).join('、')}</Text>
        </View>
      )}

      {adding ? (
        <View style={styles.addForm}>
          <TextInput style={styles.input} placeholder="食材名称 *" value={newName} onChangeText={setNewName} placeholderTextColor={Colors.textLight} />
          <TextInput style={styles.input} placeholder="数量（如：2个）" value={newAmount} onChangeText={setNewAmount} placeholderTextColor={Colors.textLight} />
          <TextInput style={styles.input} placeholder="到期日期 YYYY-MM-DD（可选）" value={newExpire} onChangeText={setNewExpire} placeholderTextColor={Colors.textLight} keyboardType="numbers-and-punctuation" />
          <View style={styles.formBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAdding(false); setNewName(''); setNewAmount(''); setNewExpire('') }}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={addManually}>
              <Text style={styles.confirmBtnText}>添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.manualBtn} onPress={() => setAdding(true)}>
          <Text style={styles.manualBtnText}>+ 手动添加</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧊</Text>
            <Text style={styles.emptyText}>冰箱是空的</Text>
            <Text style={styles.emptyHint}>拍照或手动添加食材</Text>
          </View>
        }
        renderItem={({ item }) => {
          const days = daysUntilExpiry(item.expire_date)
          const expired = days !== null && days < 0
          return (
            <TouchableOpacity style={[styles.item, expired && styles.itemExpired]} onLongPress={() => deleteItem(item.id)}>
              <View style={styles.itemContent}>
                <Text style={[styles.itemName, expired && styles.itemNameExpired]}>{item.name}</Text>
                <Text style={styles.itemAmount}>{item.amount}</Text>
              </View>
              <View style={styles.itemRight}>
                <ExpiryBadge expire_date={item.expire_date} />
                <TouchableOpacity onPress={() => deleteItem(item.id)}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', gap: 8, padding: 16 },
  cameraBtn: { flex: 2, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  cameraBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  suggestBtn: { flex: 1, backgroundColor: Colors.secondary, borderRadius: 12, padding: 14, alignItems: 'center' },
  suggestBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  alertBanner: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF3CD', borderRadius: 10, padding: 12 },
  alertText: { fontSize: 13, color: '#856404', fontWeight: '500' },
  manualBtn: { marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.card, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  manualBtnText: { fontSize: 14, color: Colors.textLight },
  addForm: { margin: 16, backgroundColor: Colors.card, borderRadius: 12, padding: 16, gap: 10 },
  input: { backgroundColor: Colors.background, borderRadius: 8, padding: 10, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  formBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 8, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 14, color: Colors.textLight },
  confirmBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 8, padding: 11, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  list: { padding: 16, gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, padding: 14 },
  itemExpired: { opacity: 0.6, borderWidth: 1, borderColor: '#dc3545' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500', color: Colors.text },
  itemNameExpired: { textDecorationLine: 'line-through', color: Colors.textLight },
  itemAmount: { fontSize: 13, color: Colors.textLight, marginTop: 2 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeExpired: { backgroundColor: '#dc354520', color: '#dc3545' },
  badgeToday: { backgroundColor: '#ff6b0020', color: '#ff6b00' },
  badgeSoon: { backgroundColor: '#ffc10720', color: '#b8860b' },
  badgeOk: { backgroundColor: '#28a74520', color: '#28a745' },
  deleteIcon: { fontSize: 18, padding: 4 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  emptyHint: { fontSize: 14, color: Colors.textLight, marginTop: 6 },
})

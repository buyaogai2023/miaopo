import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useShoppingStore } from '../../store/shoppingStore'
import { Colors } from '../../constants/colors'
import { ShoppingItem } from '../../types'
import { FridgeItem } from '../../types'

const FRIDGE_KEY = 'miaopo_fridge'
const CATEGORIES: ShoppingItem['category'][] = ['蔬菜', '肉类', '调料', '主食', '其他']

export default function ShoppingList() {
  const { items, syncing, fetchItems, syncFromFamily, addItem, getCheckedItems, toggleItem, deleteChecked } = useShoppingStore()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ShoppingItem['category']>('蔬菜')
  const [movingToFridge, setMovingToFridge] = useState(false)

  useEffect(() => {
    fetchItems()
    syncFromFamily()
  }, [])

  const handleAdd = async () => {
    if (!name.trim()) return
    await addItem(name.trim(), amount.trim(), category)
    setName(''); setAmount('')
  }

  const handleMoveToFridge = async () => {
    const checked = getCheckedItems()
    if (!checked.length) return
    setMovingToFridge(true)
    try {
      const raw = await AsyncStorage.getItem(FRIDGE_KEY)
      const fridge: FridgeItem[] = raw ? JSON.parse(raw) : []
      const existingNames = new Set(fridge.map(i => i.name))
      const toAdd: FridgeItem[] = checked
        .filter(i => !existingNames.has(i.name))
        .map(i => ({
          id: Date.now().toString() + Math.random(),
          name: i.name,
          amount: i.amount || '适量',
          added_at: new Date().toISOString(),
        }))
      await AsyncStorage.setItem(FRIDGE_KEY, JSON.stringify([...toAdd, ...fridge]))
      await deleteChecked()
      Alert.alert('✅ 已入库', `${toAdd.length} 种食材已添加到冰箱${toAdd.length < checked.length ? `（${checked.length - toAdd.length} 种冰箱已有）` : ''}`)
    } catch {
      Alert.alert('操作失败', '请重试')
    }
    setMovingToFridge(false)
  }

  const checkedCount = items.filter(i => i.checked).length

  return (
    <View style={styles.container}>
      {syncing && (
        <View style={styles.syncBar}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.syncText}>正在同步家庭购物清单...</Text>
        </View>
      )}

      <View style={styles.addSection}>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, { flex: 2 }]} placeholder="食材名称" placeholderTextColor={Colors.textLight} value={name} onChangeText={setName} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="数量" placeholderTextColor={Colors.textLight} value={amount} onChangeText={setAmount} />
        </View>
        <View style={styles.catRow}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat} style={[styles.catBtn, category === cat && styles.catBtnActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>+ 添加</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyText}>购物清单是空的</Text>
            <Text style={styles.emptyHint}>在首页推荐卡点「加购物清单」自动添加缺少食材</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.item, item.checked && styles.itemChecked]} onPress={() => toggleItem(item.id)}>
            <Text style={styles.checkbox}>{item.checked ? '✅' : '⬜️'}</Text>
            <View style={styles.itemContent}>
              <Text style={[styles.itemName, item.checked && styles.strikethrough]}>{item.name}</Text>
              {item.amount ? <Text style={styles.itemAmount}>{item.amount}</Text> : null}
            </View>
            <Text style={styles.tag}>{item.category}</Text>
          </TouchableOpacity>
        )}
      />

      {checkedCount > 0 && (
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.fridgeBtn, movingToFridge && styles.fridgeBtnLoading]}
            onPress={handleMoveToFridge}
            disabled={movingToFridge}
          >
            {movingToFridge
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.fridgeBtnText}>🧊 购物完成，入库冰箱（{checkedCount}）</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={() =>
            Alert.alert('删除已购买', `确定删除 ${checkedCount} 个已勾选的食材？`, [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: deleteChecked }
            ])
          }>
            <Text style={styles.clearBtnText}>🗑 删除</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  syncBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary + '15', paddingHorizontal: 16, paddingVertical: 8 },
  syncText: { fontSize: 13, color: Colors.primary },
  addSection: { backgroundColor: Colors.card, padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: Colors.background, borderRadius: 8, padding: 10, fontSize: 15, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  catRow: { flexDirection: 'row', gap: 6 },
  catBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  catBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catText: { fontSize: 12, color: Colors.textLight },
  catTextActive: { color: '#fff' },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  addBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  list: { padding: 16, gap: 8, paddingBottom: 120 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, padding: 12, gap: 10 },
  itemChecked: { opacity: 0.5 },
  checkbox: { fontSize: 20 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500', color: Colors.text },
  strikethrough: { textDecorationLine: 'line-through' },
  itemAmount: { fontSize: 13, color: Colors.textLight },
  tag: { fontSize: 11, color: Colors.primary, backgroundColor: '#FFF0EB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 56 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  emptyHint: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingHorizontal: 32 },
  bottomActions: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 28, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  fridgeBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  fridgeBtnLoading: { opacity: 0.7 },
  fridgeBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  clearBtn: { backgroundColor: '#FFF0EB', borderRadius: 12, paddingHorizontal: 16, padding: 14, alignItems: 'center' },
  clearBtnText: { fontSize: 14, color: Colors.error, fontWeight: '600' },
})

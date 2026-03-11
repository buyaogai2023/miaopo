import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator, Modal, Image } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useShoppingStore } from '../../store/shoppingStore'
import { Colors } from '../../constants/colors'
import { ShoppingItem } from '../../types'
import { FridgeItem } from '../../types'

const FRIDGE_KEY = 'miaopo_fridge'
const CATEGORIES: ShoppingItem['category'][] = ['蔬菜', '肉类', '调料', '主食', '其他']

const FOOD_EMOJI_MAP: Record<string, string> = {
  // 蔬菜
  '西红柿': '🍅', '番茄': '🍅', '土豆': '🥔', '马铃薯': '🥔', '胡萝卜': '🥕',
  '洋葱': '🧅', '大蒜': '🧄', '蒜': '🧄', '姜': '🫚', '生姜': '🫚',
  '白菜': '🥬', '大白菜': '🥬', '菠菜': '🥬', '生菜': '🥬', '芹菜': '🌿',
  '黄瓜': '🥒', '茄子': '🍆', '青椒': '🫑', '辣椒': '🌶️', '红椒': '🌶️',
  '玉米': '🌽', '南瓜': '🎃', '冬瓜': '🟢', '丝瓜': '🟢', '苦瓜': '🟢',
  '豆腐': '🟨', '豆角': '🫘', '毛豆': '🫘', '黄豆': '🫘', '绿豆': '🫘',
  '香菇': '🍄', '蘑菇': '🍄', '木耳': '🍄', '银耳': '🍄', '金针菇': '🍄',
  '韭菜': '🌿', '葱': '🌿', '小葱': '🌿', '香菜': '🌿', '蒜苗': '🌿',
  '莲藕': '🪷', '山药': '🍠', '红薯': '🍠', '地瓜': '🍠',
  // 肉类
  '猪肉': '🥩', '排骨': '🍖', '猪排': '🍖', '五花肉': '🥩', '猪蹄': '🍖',
  '牛肉': '🥩', '牛腩': '🥩', '牛排': '🥩', '羊肉': '🍖', '羊排': '🍖',
  '鸡肉': '🍗', '鸡腿': '🍗', '鸡翅': '🍗', '鸡胸肉': '🍗', '鸡爪': '🍗',
  '鸭肉': '🦆', '鸭腿': '🦆', '烤鸭': '🦆',
  '培根': '🥓', '火腿': '🥓', '香肠': '🌭', '腊肠': '🌭',
  // 海鲜
  '鱼': '🐟', '草鱼': '🐟', '鲫鱼': '🐟', '带鱼': '🐟', '鲈鱼': '🐟',
  '虾': '🦐', '大虾': '🦐', '基围虾': '🦐', '螃蟹': '🦀', '蟹': '🦀',
  '鱿鱼': '🦑', '扇贝': '🐚', '蛤蜊': '🐚', '牡蛎': '🦪',
  // 蛋奶
  '鸡蛋': '🥚', '蛋': '🥚', '皮蛋': '🥚', '咸蛋': '🥚',
  '牛奶': '🥛', '奶': '🥛', '酸奶': '🥛', '奶油': '🧈', '黄油': '🧈', '芝士': '🧀',
  // 主食
  '大米': '🌾', '米': '🍚', '白米': '🌾', '糯米': '🌾',
  '面粉': '🌾', '面条': '🍜', '米粉': '🍜', '粉丝': '🍜',
  '馒头': '🥖', '包子': '🥟', '饺子': '🥟', '面包': '🍞',
  // 调料
  '酱油': '🫙', '生抽': '🫙', '老抽': '🫙', '料酒': '🍶',
  '醋': '🫙', '白醋': '🫙', '香醋': '🫙', '糖': '🍬', '盐': '🧂',
  '油': '🫙', '花生油': '🫙', '菜籽油': '🫙', '芝麻油': '🫙',
  '豆瓣酱': '🫙', '蚝油': '🫙', '番茄酱': '🫙', '辣椒酱': '🌶️',
  '八角': '⭐', '花椒': '⭐', '桂皮': '🌿', '香叶': '🍃',
  // 水果
  '苹果': '🍎', '香蕉': '🍌', '橙子': '🍊', '橘子': '🍊', '柠檬': '🍋',
  '草莓': '🍓', '葡萄': '🍇', '西瓜': '🍉', '哈密瓜': '🍈', '芒果': '🥭',
  '梨': '🍐', '桃': '🍑', '樱桃': '🍒', '菠萝': '🍍', '椰子': '🥥',
}

const CATEGORY_EMOJI: Record<string, string> = {
  '蔬菜': '🥬', '肉类': '🥩', '调料': '🫙', '主食': '🌾', '其他': '🛒',
}

function getFoodEmoji(name: string, category: string): string {
  for (const [key, emoji] of Object.entries(FOOD_EMOJI_MAP)) {
    if (name.includes(key)) return emoji
  }
  return CATEGORY_EMOJI[category] || '🛒'
}

// TheMealDB 食材图片库 - 免费、无需 API key、URL 稳定
const FOOD_NAME_MAP: [string, string][] = [
  ['西红柿', 'Tomatoes'], ['番茄', 'Tomatoes'],
  ['土豆', 'Potatoes'], ['马铃薯', 'Potatoes'],
  ['胡萝卜', 'Carrots'],
  ['洋葱', 'Onion'],
  ['大蒜', 'Garlic'], ['蒜', 'Garlic'],
  ['姜', 'Ginger'], ['生姜', 'Ginger'],
  ['菠菜', 'Spinach'],
  ['黄瓜', 'Cucumber'],
  ['茄子', 'Aubergine'],
  ['辣椒', 'Red Chilli'], ['青椒', 'Green Pepper'], ['红椒', 'Red Pepper'],
  ['玉米', 'Sweetcorn'],
  ['西兰花', 'Broccoli'],
  ['蘑菇', 'Mushrooms'], ['香菇', 'Mushrooms'],
  ['芹菜', 'Celery'],
  ['白菜', 'Cabbage'], ['大白菜', 'Cabbage'],
  ['猪肉', 'Pork'], ['五花肉', 'Pork'], ['排骨', 'Pork'],
  ['牛肉', 'Beef'], ['牛腩', 'Beef'],
  ['羊肉', 'Lamb'],
  ['鸡肉', 'Chicken'], ['鸡胸肉', 'Chicken'], ['鸡腿', 'Chicken'], ['鸡翅', 'Chicken'],
  ['培根', 'Bacon'],
  ['香肠', 'Sausages'],
  ['虾', 'Prawns'], ['大虾', 'Prawns'],
  ['三文鱼', 'Salmon'],
  ['金枪鱼', 'Tuna'],
  ['鸡蛋', 'Eggs'], ['蛋', 'Eggs'],
  ['牛奶', 'Milk'], ['奶', 'Milk'],
  ['黄油', 'Butter'],
  ['奶酪', 'Cheddar Cheese'],
  ['大米', 'Rice'], ['米', 'Rice'],
  ['面粉', 'Plain Flour'],
  ['面条', 'Noodles'],
  ['苹果', 'Apples'],
  ['香蕉', 'Bananas'],
  ['橙子', 'Orange'], ['橘子', 'Orange'],
  ['柠檬', 'Lemon'],
  ['草莓', 'Strawberries'],
  ['葡萄', 'Grapes'],
  ['芒果', 'Mango'],
  ['菠萝', 'Pineapple'],
  ['酱油', 'Soy Sauce'],
  ['盐', 'Salt'],
  ['糖', 'Sugar'],
  ['蜂蜜', 'Honey'],
  ['橄榄油', 'Olive Oil'],
  ['酸奶', 'Natural Yogurt'],
]

function getFoodImageUrl(name: string): string | null {
  for (const [key, en] of FOOD_NAME_MAP) {
    if (name.includes(key)) {
      return `https://www.themealdb.com/images/ingredients/${encodeURIComponent(en)}.png`
    }
  }
  return null
}

function FoodImage({ name, category, size = 52 }: { name: string; category: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const url = getFoodImageUrl(name)
  if (!url || failed) {
    return <Text style={{ fontSize: size * 0.58 }}>{getFoodEmoji(name, category)}</Text>
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
      onError={() => setFailed(true)}
    />
  )
}


export default function ShoppingList() {
  const { items, syncing, fetchItems, syncFromFamily, addItem, getCheckedItems, toggleItem, deleteChecked } = useShoppingStore()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ShoppingItem['category']>('蔬菜')
  const [movingToFridge, setMovingToFridge] = useState(false)
  const [previewItem, setPreviewItem] = useState<ShoppingItem | null>(null)

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
          <TouchableOpacity
            style={[styles.item, item.checked && styles.itemChecked]}
            onPress={() => toggleItem(item.id)}
            onLongPress={() => setPreviewItem(item)}
          >
            <TouchableOpacity style={[styles.foodIcon, item.checked && styles.foodIconChecked]} onPress={() => setPreviewItem(item)}>
              <FoodImage name={item.name} category={item.category} size={52} />
            </TouchableOpacity>
            <View style={styles.itemContent}>
              <Text style={[styles.itemName, item.checked && styles.strikethrough]}>{item.name}</Text>
              <View style={styles.itemMeta}>
                {item.amount ? <Text style={styles.itemAmount}>{item.amount}</Text> : null}
                <Text style={styles.tag}>{item.category}</Text>
              </View>
            </View>
            <Text style={styles.checkbox}>{item.checked ? '✅' : '⬜️'}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!previewItem} transparent animationType="fade" onRequestClose={() => setPreviewItem(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPreviewItem(null)}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBg}>
              {previewItem && <FoodImage name={previewItem.name} category={previewItem.category} size={180} />}
            </View>
            <Text style={styles.modalName}>{previewItem?.name}</Text>
            {previewItem?.amount && <Text style={styles.modalAmount}>需要：{previewItem.amount}</Text>}
            <Text style={styles.modalTag}>{previewItem?.category}</Text>
            <Text style={styles.modalHint}>点击任意处关闭</Text>
          </View>
        </TouchableOpacity>
      </Modal>

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
  list: { padding: 16, gap: 10, paddingBottom: 120 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 14, padding: 12, gap: 12 },
  itemChecked: { opacity: 0.45 },
  checkbox: { fontSize: 22 },
  foodIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#FFF5F0', alignItems: 'center', justifyContent: 'center' },
  foodIconChecked: { backgroundColor: '#F0F0F0' },
  foodEmoji: { fontSize: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 28, padding: 32, alignItems: 'center', width: 260 },
  modalIconBg: { width: 180, height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 20, backgroundColor: '#FFF5F0', alignItems: 'center', justifyContent: 'center' },
  modalEmoji: { fontSize: 80 },
  modalName: { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  modalAmount: { fontSize: 16, color: '#FF6B35', fontWeight: '700', marginBottom: 4 },
  modalTag: { fontSize: 13, color: '#999', marginBottom: 16 },
  modalHint: { fontSize: 12, color: '#ccc' },
  itemContent: { flex: 1 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  itemName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  strikethrough: { textDecorationLine: 'line-through', color: Colors.textLight },
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

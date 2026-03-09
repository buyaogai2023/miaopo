import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ShoppingItem } from '../types'
import { supabase } from '../services/supabase'

const STORAGE_KEY = 'miaopo_shopping'

async function getFamilyCode(): Promise<string> {
  const raw = await AsyncStorage.getItem('miaopo_family')
  return raw ? JSON.parse(raw).familyCode || '' : ''
}

async function pushToSupabase(familyCode: string, items: ShoppingItem[]) {
  if (!familyCode) return
  try {
    await supabase.from('family_shopping').upsert(
      { code: familyCode, items: JSON.stringify(items), updated_at: new Date().toISOString() },
      { onConflict: 'code' }
    )
  } catch {}
}

interface ShoppingStore {
  items: ShoppingItem[]
  syncing: boolean
  fetchItems: () => Promise<void>
  syncFromFamily: () => Promise<void>
  addItem: (name: string, amount: string, category: ShoppingItem['category']) => Promise<void>
  addMissingItems: (missing: string[]) => Promise<number>
  getCheckedItems: () => ShoppingItem[]
  toggleItem: (id: string) => Promise<void>
  deleteChecked: () => Promise<void>
}

export const useShoppingStore = create<ShoppingStore>((set, get) => ({
  items: [],
  syncing: false,

  fetchItems: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    set({ items: raw ? JSON.parse(raw) : [] })
  },

  syncFromFamily: async () => {
    const code = await getFamilyCode()
    if (!code) return
    set({ syncing: true })
    try {
      const { data } = await supabase.from('family_shopping').select('items').eq('code', code).single()
      if (data?.items) {
        const remote: ShoppingItem[] = JSON.parse(data.items)
        // 合并：本地有但远端没有的保留，远端有的以远端为准
        const local = get().items
        const remoteIds = new Set(remote.map(i => i.id))
        const localOnly = local.filter(i => !remoteIds.has(i.id))
        const merged = [...remote, ...localOnly]
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        set({ items: merged })
      }
    } catch {}
    set({ syncing: false })
  },

  addItem: async (name, amount, category) => {
    const newItem: ShoppingItem = {
      id: Date.now().toString(),
      name, amount, category,
      checked: false,
      created_at: new Date().toISOString(),
      user_id: '',
    }
    const items = [newItem, ...get().items]
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    set({ items })
    const code = await getFamilyCode()
    pushToSupabase(code, items)
  },

  addMissingItems: async (missing) => {
    const existing = new Set(get().items.map(i => i.name))
    const toAdd = missing.filter(name => !existing.has(name))
    if (!toAdd.length) return 0
    const now = Date.now()
    const newItems: ShoppingItem[] = toAdd.map((name, i) => ({
      id: (now + i).toString(), name, amount: '适量', category: '其他' as ShoppingItem['category'],
      checked: false, created_at: new Date().toISOString(), user_id: '',
    }))
    const items = [...newItems, ...get().items]
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    set({ items })
    const code = await getFamilyCode()
    pushToSupabase(code, items)
    return toAdd.length
  },

  getCheckedItems: () => get().items.filter(i => i.checked),

  toggleItem: async (id) => {
    const items = get().items.map(i => i.id === id ? { ...i, checked: !i.checked } : i)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    set({ items })
    const code = await getFamilyCode()
    pushToSupabase(code, items)
  },

  deleteChecked: async () => {
    const items = get().items.filter(i => !i.checked)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    set({ items })
    const code = await getFamilyCode()
    pushToSupabase(code, items)
  },
}))

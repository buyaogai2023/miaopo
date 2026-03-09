import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Message } from '../services/aiChef'

export interface SavedMessage {
  id: string
  content: string
  savedAt: string  // ISO string
}

interface ChatStore {
  messages: Message[]
  visible: boolean
  appData: { fridge: any[]; shopping: any[]; recipes: any[]; mealPlan: any[] }
  saved: SavedMessage[]
  addMessage: (msg: Message) => void
  appendToLast: (delta: string) => void
  setVisible: (v: boolean) => void
  setAppData: (d: any) => void
  saveMessage: (content: string) => Promise<void>
  unsaveMessage: (id: string) => Promise<void>
  loadSaved: () => Promise<void>
}

const SAVED_KEY = 'miaopo_saved_messages'

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  visible: false,
  appData: { fridge: [], shopping: [], recipes: [], mealPlan: [] },
  saved: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLast: (delta) => set((s) => {
    const msgs = [...s.messages]
    if (!msgs.length) return s
    const last = msgs[msgs.length - 1]
    if (last.role !== 'assistant') return s
    msgs[msgs.length - 1] = { ...last, content: last.content + delta }
    return { messages: msgs }
  }),
  setVisible: (visible) => set({ visible }),
  setAppData: (appData) => set({ appData }),
  saveMessage: async (content) => {
    const item: SavedMessage = {
      id: Date.now().toString(),
      content,
      savedAt: new Date().toISOString(),
    }
    const next = [item, ...get().saved]
    set({ saved: next })
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next))
  },
  unsaveMessage: async (id) => {
    const next = get().saved.filter(m => m.id !== id)
    set({ saved: next })
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next))
  },
  loadSaved: async () => {
    const raw = await AsyncStorage.getItem(SAVED_KEY)
    if (raw) set({ saved: JSON.parse(raw) })
  },
}))

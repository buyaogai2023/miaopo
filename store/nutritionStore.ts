import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LOG_KEY = 'miaopo_nutrition_log'
const FEEDBACK_KEY = 'miaopo_rec_feedback'

export interface NutritionLog {
  id: string
  date: string        // YYYY-MM-DD
  meal: string        // 早餐/午餐/晚餐
  title: string
  calories: number
  protein: number
  fat: number
  carbs: number
}

export interface RecFeedback {
  title: string
  liked: boolean
  date: string
}

interface NutritionStore {
  logs: NutritionLog[]
  feedbacks: RecFeedback[]
  loadLogs: () => Promise<void>
  addLog: (log: Omit<NutritionLog, 'id'>) => Promise<void>
  loadFeedbacks: () => Promise<void>
  addFeedback: (title: string, liked: boolean) => Promise<void>
  getTodayLogs: () => NutritionLog[]
  getWeekLogs: () => NutritionLog[]
  getLikedTitles: () => string[]
  getDislikedTitles: () => string[]
}

const TODAY = () => new Date().toISOString().slice(0, 10)
const WEEK_AGO = () => {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export const useNutritionStore = create<NutritionStore>((set, get) => ({
  logs: [],
  feedbacks: [],

  loadLogs: async () => {
    const raw = await AsyncStorage.getItem(LOG_KEY)
    set({ logs: raw ? JSON.parse(raw) : [] })
  },

  addLog: async (log) => {
    const newLog = { ...log, id: Date.now().toString() }
    const logs = [newLog, ...get().logs]
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs))
    set({ logs })
  },

  loadFeedbacks: async () => {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY)
    set({ feedbacks: raw ? JSON.parse(raw) : [] })
  },

  addFeedback: async (title, liked) => {
    const fb: RecFeedback = { title, liked, date: TODAY() }
    const feedbacks = [fb, ...get().feedbacks.filter(f => f.title !== title)].slice(0, 50)
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbacks))
    set({ feedbacks })
  },

  getTodayLogs: () => get().logs.filter(l => l.date === TODAY()),

  getWeekLogs: () => get().logs.filter(l => l.date >= WEEK_AGO()),

  getLikedTitles: () => get().feedbacks.filter(f => f.liked).map(f => f.title).slice(0, 10),

  getDislikedTitles: () => get().feedbacks.filter(f => !f.liked).map(f => f.title).slice(0, 10),
}))

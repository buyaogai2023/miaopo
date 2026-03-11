import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../services/supabase'

const STORAGE_KEY = 'miaopo_family'

export interface OnboardingData {
  familySize: string       // Q1 家庭人数
  tastes: string[]         // Q2 口味偏好
  dietary: string[]        // Q3 忌口健康需求
  cookRole: string         // Q4 谁来做饭
  cookTime: string         // Q5 做饭时间
  budget: string           // Q6 每月预算
  aiProfile: string        // AI生成的家庭饮食画像
  completed: boolean
}

export interface HealthProfile {
  age?: number
  gender?: '男' | '女'
  height?: number
  weight?: number
  goal?: '减重' | '增肌' | '维持' | '控糖' | '控压'
  conditions?: string[]  // ['高血压','糖尿病','高血脂']
  allergies?: string[]   // ['海鲜','坚果']
  activity?: '久坐' | '轻度' | '中度' | '活跃'
}

export interface FamilyMember {
  id: string
  name: string
  avatar: string
  tastes: string[]
  is_me: boolean
  health?: HealthProfile
}

interface FamilyStore {
  members: FamilyMember[]
  familyCode: string   // 6位家庭共享码
  syncing: boolean
  onboarding: OnboardingData | null
  load: () => Promise<void>
  save: (members: FamilyMember[]) => Promise<void>
  addMember: (name: string, avatar: string, tastes: string[], health?: HealthProfile) => Promise<void>
  updateMember: (id: string, patch: Partial<FamilyMember>) => Promise<void>
  deleteMember: (id: string) => Promise<void>
  setFamilyCode: (code: string) => Promise<void>
  myTastes: () => string[]
  saveOnboarding: (data: OnboardingData) => Promise<void>
}

const AVATARS = ['🧑‍🍳','👨','👩','👦','👧','👴','👵']
function randomAvatar() { return AVATARS[Math.floor(Math.random() * AVATARS.length)] }
function genCode() { return Math.random().toString(36).slice(2, 8).toUpperCase() }

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  members: [],
  familyCode: '',
  syncing: false,
  onboarding: null,

  load: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      const { members, familyCode, onboarding } = JSON.parse(raw)
      set({ members: members || [], familyCode: familyCode || '', onboarding: onboarding || null })
    } else {
      // 首次：创建"我"
      const me: FamilyMember = { id: Date.now().toString(), name: '我', avatar: '🧑‍🍳', tastes: [], is_me: true }
      const code = genCode()
      const data = { members: [me], familyCode: code }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      set({ members: [me], familyCode: code })
    }
  },

  save: async (members) => {
    const { familyCode, onboarding } = get()
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ members, familyCode, onboarding }))
    set({ members })
  },

  saveOnboarding: async (data) => {
    const { members, familyCode } = get()
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ members, familyCode, onboarding: data }))
    set({ onboarding: data })
  },

  addMember: async (name, avatar, tastes, health) => {
    const member: FamilyMember = { id: Date.now().toString(), name, avatar: avatar || randomAvatar(), tastes, is_me: false, health }
    await get().save([...get().members, member])
  },

  updateMember: async (id, patch) => {
    await get().save(get().members.map(m => m.id === id ? { ...m, ...patch } : m))
  },

  deleteMember: async (id) => {
    await get().save(get().members.filter(m => m.id !== id))
  },

  setFamilyCode: async (code) => {
    const { members } = get()
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ members, familyCode: code }))
    set({ familyCode: code })
  },

  myTastes: () => get().members.find(m => m.is_me)?.tastes || [],
}))

// 购物清单 Supabase 实时同步
export async function syncShoppingToSupabase(familyCode: string, items: any[]) {
  if (!familyCode) return
  try {
    await supabase.from('family_shopping').upsert({ code: familyCode, items: JSON.stringify(items), updated_at: new Date().toISOString() }, { onConflict: 'code' })
  } catch {}
}

export async function fetchShoppingFromSupabase(familyCode: string): Promise<any[] | null> {
  if (!familyCode) return null
  try {
    const { data } = await supabase.from('family_shopping').select('items').eq('code', familyCode).single()
    return data ? JSON.parse(data.items) : null
  } catch { return null }
}

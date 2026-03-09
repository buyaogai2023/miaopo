import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Recipe } from '../types'

const STORAGE_KEY = 'miaopo_recipes'

interface RecipeStore {
  recipes: Recipe[]
  loading: boolean
  fetchRecipes: () => Promise<void>
  addRecipe: (recipe: Omit<Recipe, 'id' | 'created_at'>) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
}

export const useRecipeStore = create<RecipeStore>((set, get) => ({
  recipes: [],
  loading: false,

  fetchRecipes: async () => {
    set({ loading: true })
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const recipes = raw ? JSON.parse(raw) : []
      set({ recipes })
    } finally {
      set({ loading: false })
    }
  },

  addRecipe: async (recipe) => {
    const newRecipe: Recipe = {
      ...recipe,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
    }
    const recipes = [newRecipe, ...get().recipes]
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes))
    set({ recipes })
  },

  deleteRecipe: async (id) => {
    const recipes = get().recipes.filter(r => r.id !== id)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes))
    set({ recipes })
  },
}))

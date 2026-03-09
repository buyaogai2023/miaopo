export interface Ingredient {
  name: string
  amount: string
}

export interface Recipe {
  id: string
  user_id: string
  title: string
  ingredients: Ingredient[]
  steps: string[]
  cook_time?: number
  servings?: number
  source_url?: string
  source_platform?: 'douyin' | 'xiaohongshu' | 'bilibili' | 'web' | 'manual'
  cover_image?: string
  notes?: string
  tags: string[]
  is_favorite?: boolean
  created_at: string
}

export interface ShoppingItem {
  id: string
  user_id: string
  name: string
  amount: string
  checked: boolean
  category: '蔬菜' | '肉类' | '调料' | '主食' | '其他'
  created_at: string
}

export interface FridgeItem {
  id: string
  name: string
  amount: string
  expire_date?: string
  added_at: string
}

export interface MealPlan {
  id: string
  date: string  // YYYY-MM-DD
  meal_type: '早餐' | '午餐' | '晚餐'
  recipe_id: string
  recipe_title: string
}

import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://hrxljtjrteunldtwtwrz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyeGxqdGpydGV1bmxkdHd0d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTk1MzAsImV4cCI6MjA4ODQ5NTUzMH0.5OVGtipSwMaxrOkEUbq7Hdz9sPtCezqHxADtXfr4Rx8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

import { View, Text, StyleSheet, Image } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '../services/supabase'
import { Colors } from '../constants/colors'

export default function LoginScreen() {
  const handleAppleLogin = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      })
      if (error) throw error
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple login error:', e)
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🍳</Text>
      <Text style={styles.title}>妙谱</Text>
      <Text style={styles.subtitle}>AI智能菜谱管理</Text>

      <View style={styles.footer}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleBtn}
          onPress={handleAppleLogin}
        />
        <Text style={styles.tip}>使用 Apple ID 安全登录，无需注册</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 80, marginBottom: 16 },
  title: { fontSize: 36, fontWeight: '800', color: Colors.text, letterSpacing: 2 },
  subtitle: { fontSize: 16, color: Colors.textLight, marginTop: 8, marginBottom: 60 },
  footer: { width: '100%', gap: 12, alignItems: 'center' },
  appleBtn: { width: '100%', height: 52 },
  tip: { fontSize: 13, color: Colors.textLight, textAlign: 'center' },
})

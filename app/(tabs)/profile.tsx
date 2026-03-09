import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, TextInput, Share } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Colors } from '../../constants/colors'
import { useFamilyStore, FamilyMember, HealthProfile } from '../../store/familyStore'
import { useShoppingStore } from '../../store/shoppingStore'

const TASTE_OPTIONS = ['清淡', '重口', '辣', '不辣', '甜', '素食', '低脂', '快手', '下饭']
const AVATARS = ['🧑‍🍳', '👨', '👩', '👦', '👧', '👴', '👵', '🐱', '🐶']
const GOALS = ['减重', '增肌', '维持', '控糖', '控压'] as const
const CONDITIONS = ['高血压', '糖尿病', '高血脂', '痛风', '素食']
const ACTIVITIES = ['久坐', '轻度', '中度', '活跃'] as const

export default function ProfileScreen() {
  const { members, familyCode, load, addMember, updateMember, deleteMember, setFamilyCode } = useFamilyStore()
  const { syncFromFamily } = useShoppingStore()
  const [addModal, setAddModal] = useState(false)
  const [joinModal, setJoinModal] = useState(false)
  const [editMember, setEditMember] = useState<FamilyMember | null>(null)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('👨')
  const [tastes, setTastes] = useState<string[]>([])
  const [joinCode, setJoinCode] = useState('')
  // 健康档案
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'男'|'女'|''>('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [goal, setGoal] = useState<HealthProfile['goal'] | ''>('')
  const [conditions, setConditions] = useState<string[]>([])
  const [allergies, setAllergies] = useState('')
  const [activity, setActivity] = useState<HealthProfile['activity'] | ''>('')

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setName(''); setAvatar('👨'); setTastes([]); setEditMember(null)
    setAge(''); setGender(''); setHeight(''); setWeight(''); setGoal(''); setConditions([]); setAllergies(''); setActivity('')
    setAddModal(true)
  }
  const openEdit = (m: FamilyMember) => {
    setName(m.name); setAvatar(m.avatar); setTastes(m.tastes); setEditMember(m)
    setAge(m.health?.age?.toString() || '')
    setGender(m.health?.gender || '')
    setHeight(m.health?.height?.toString() || '')
    setWeight(m.health?.weight?.toString() || '')
    setGoal(m.health?.goal || '')
    setConditions(m.health?.conditions || [])
    setAllergies(m.health?.allergies?.join('、') || '')
    setActivity(m.health?.activity || '')
    setAddModal(true)
  }

  const save = async () => {
    if (!name.trim()) { Alert.alert('请输入姓名'); return }
    const health: HealthProfile = {
      age: age ? Number(age) : undefined,
      gender: gender || undefined,
      height: height ? Number(height) : undefined,
      weight: weight ? Number(weight) : undefined,
      goal: goal || undefined,
      conditions: conditions.length ? conditions : undefined,
      allergies: allergies.trim() ? allergies.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : undefined,
      activity: activity || undefined,
    }
    if (editMember) {
      await updateMember(editMember.id, { name: name.trim(), avatar, tastes, health })
    } else {
      await addMember(name.trim(), avatar, tastes, health)
    }
    setAddModal(false)
  }

  const del = (m: FamilyMember) => {
    if (m.is_me) { Alert.alert('不能删除自己'); return }
    Alert.alert('删除成员', `确定删除 ${m.name}？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteMember(m.id) }
    ])
  }

  const shareCode = () => {
    Share.share({ message: `加入我在妙谱的家庭，共享购物清单！共享码：${familyCode}` })
  }

  const joinFamily = async () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) { Alert.alert('请输入正确的共享码'); return }
    await setFamilyCode(code)
    await syncFromFamily()
    setJoinModal(false)
    setJoinCode('')
    Alert.alert('加入成功', `已加入家庭 ${code}，购物清单已同步`)
  }

  const clearAllData = () => {
    Alert.alert('清除所有数据', '确定清除所有本地数据？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['miaopo_recipes', 'miaopo_shopping', 'miaopo_fridge', 'miaopo_mealplan'])
          Alert.alert('完成', '数据已清除')
        }
      }
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🍳</Text>
        <Text style={styles.heroTitle}>妙谱</Text>
        <Text style={styles.heroSub}>AI智能菜谱管理</Text>
      </View>

      {/* 家庭成员 */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>家庭成员</Text>
          <TouchableOpacity onPress={openAdd}>
            <Text style={styles.addBtn}>+ 添加</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {members.map((m, i) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberRow, i < members.length - 1 && styles.rowBorder]}
              onPress={() => openEdit(m)}
              onLongPress={() => del(m)}
            >
              <Text style={styles.memberAvatar}>{m.avatar}</Text>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.name}{m.is_me ? ' (我)' : ''}</Text>
                {m.tastes.length > 0
                  ? <Text style={styles.memberTastes}>{m.tastes.join(' · ')}</Text>
                  : <Text style={styles.memberTastesEmpty}>点击设置口味偏好</Text>}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>家庭共享码</Text>
          <Text style={styles.codeValue}>{familyCode}</Text>
          <Text style={styles.codeHint}>家人使用同一个码即可同步购物清单</Text>
          <View style={styles.codeBtns}>
            <TouchableOpacity style={styles.codeBtn} onPress={shareCode}>
              <Text style={styles.codeBtnText}>📤 分享给家人</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.codeBtn, styles.codeBtnSecondary]} onPress={() => { setJoinCode(''); setJoinModal(true) }}>
              <Text style={styles.codeBtnTextSecondary}>🔗 加入家庭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 会员 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>会员功能</Text>
        <View style={styles.proCard}>
          <Text style={styles.proTitle}>🌟 妙谱专业版</Text>
          <Text style={styles.proDesc}>无限菜谱 · 冰箱管理 · 餐计划 · 云端同步</Text>
          <TouchableOpacity style={styles.proBtn} onPress={() => Alert.alert('即将开放', '订阅功能正在开发中')}>
            <Text style={styles.proBtnText}>¥68/年 立即订阅</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关于</Text>
        <View style={styles.card}>
          <Row label="版本" value="1.1.0" />
          <Row label="开发者" value="妙谱团队" last />
        </View>
      </View>

      <TouchableOpacity style={styles.dangerBtn} onPress={clearAllData}>
        <Text style={styles.dangerBtnText}>清除所有本地数据</Text>
      </TouchableOpacity>

      {/* 加入家庭 Modal */}
      <Modal visible={joinModal} transparent animationType="fade" onRequestClose={() => setJoinModal(false)}>
        <View style={styles.joinOverlay}>
          <View style={styles.joinBox}>
            <Text style={styles.joinTitle}>加入家庭</Text>
            <Text style={styles.joinHint}>输入家人的共享码，加入后购物清单将自动同步</Text>
            <TextInput
              style={styles.joinInput}
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase())}
              placeholder="输入6位共享码"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="characters"
              maxLength={8}
            />
            <View style={styles.joinBtns}>
              <TouchableOpacity style={styles.joinCancel} onPress={() => setJoinModal(false)}>
                <Text style={styles.joinCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.joinConfirm} onPress={joinFamily}>
                <Text style={styles.joinConfirmText}>加入</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 添加/编辑成员 Modal */}
      <Modal visible={addModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAddModal(false)}>
              <Text style={styles.modalCancel}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editMember ? '编辑成员' : '添加成员'}</Text>
            <TouchableOpacity onPress={save}>
              <Text style={styles.modalSave}>保存</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* 头像选择 */}
            <Text style={styles.label}>选择头像</Text>
            <View style={styles.avatarRow}>
              {AVATARS.map(a => (
                <TouchableOpacity key={a} style={[styles.avatarBtn, avatar === a && styles.avatarBtnSelected]} onPress={() => setAvatar(a)}>
                  <Text style={styles.avatarText}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>姓名</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="如：爸爸、妈妈、小明"
              placeholderTextColor={Colors.textLight}
            />

            <Text style={styles.label}>口味偏好（可多选）</Text>
            <View style={styles.tasteWrap}>
              {TASTE_OPTIONS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tasteTag, tastes.includes(t) && styles.tasteTagOn]}
                  onPress={() => setTastes(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t])}
                >
                  <Text style={[styles.tasteTagText, tastes.includes(t) && styles.tasteTagTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionDivider}>— 健康档案（用于AI推荐）—</Text>

            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>年龄</Text>
                <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="岁" placeholderTextColor={Colors.textLight} />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>性别</Text>
                <View style={styles.genderRow}>
                  {(['男','女'] as const).map(g => (
                    <TouchableOpacity key={g} style={[styles.genderBtn, gender === g && styles.genderBtnOn]} onPress={() => setGender(g)}>
                      <Text style={[styles.genderText, gender === g && styles.genderTextOn]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>身高 (cm)</Text>
                <TextInput style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="170" placeholderTextColor={Colors.textLight} />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>体重 (kg)</Text>
                <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="65" placeholderTextColor={Colors.textLight} />
              </View>
            </View>

            <Text style={styles.label}>健康目标</Text>
            <View style={styles.tasteWrap}>
              {GOALS.map(g => (
                <TouchableOpacity key={g} style={[styles.tasteTag, goal === g && styles.tasteTagOn]} onPress={() => setGoal(goal === g ? '' : g)}>
                  <Text style={[styles.tasteTagText, goal === g && styles.tasteTagTextOn]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>健康状况（可多选）</Text>
            <View style={styles.tasteWrap}>
              {CONDITIONS.map(c => (
                <TouchableOpacity key={c} style={[styles.tasteTag, conditions.includes(c) && styles.tasteTagOn]} onPress={() => setConditions(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])}>
                  <Text style={[styles.tasteTagText, conditions.includes(c) && styles.tasteTagTextOn]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>活动量</Text>
            <View style={styles.tasteWrap}>
              {ACTIVITIES.map(a => (
                <TouchableOpacity key={a} style={[styles.tasteTag, activity === a && styles.tasteTagOn]} onPress={() => setActivity(activity === a ? '' : a)}>
                  <Text style={[styles.tasteTagText, activity === a && styles.tasteTagTextOn]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>过敏食材（逗号分隔）</Text>
            <TextInput style={styles.input} value={allergies} onChangeText={setAllergies} placeholder="如：海鲜、坚果、花生" placeholderTextColor={Colors.textLight} />
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, gap: 20 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  heroIcon: { fontSize: 64 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, marginTop: 8 },
  heroSub: { fontSize: 14, color: Colors.textLight, marginTop: 4 },
  section: { gap: 10 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 1 },
  addBtn: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  card: { backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { fontSize: 15, color: Colors.text },
  rowValue: { fontSize: 15, color: Colors.textLight },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberAvatar: { fontSize: 32 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  memberTastes: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  memberTastesEmpty: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  chevron: { fontSize: 20, color: Colors.textLight },
  codeBox: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  codeLabel: { fontSize: 12, color: Colors.textLight },
  codeValue: { fontSize: 28, fontWeight: '800', color: Colors.primary, letterSpacing: 4 },
  codeHint: { fontSize: 12, color: Colors.textLight, textAlign: 'center', marginTop: 4 },
  codeBtns: { flexDirection: 'row', gap: 10, marginTop: 10, width: '100%' },
  codeBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 10, padding: 11, alignItems: 'center' },
  codeBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  codeBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  codeBtnTextSecondary: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  joinOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 30 },
  joinBox: { backgroundColor: Colors.card, borderRadius: 16, padding: 24, width: '100%', gap: 12 },
  joinTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  joinHint: { fontSize: 13, color: Colors.textLight, lineHeight: 18 },
  joinInput: { backgroundColor: Colors.background, borderRadius: 10, padding: 14, fontSize: 20, color: Colors.primary, fontWeight: '800', letterSpacing: 4, textAlign: 'center', borderWidth: 1, borderColor: Colors.border },
  joinBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  joinCancel: { flex: 1, borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  joinCancelText: { fontSize: 15, color: Colors.textLight },
  joinConfirm: { flex: 1, backgroundColor: Colors.primary, borderRadius: 10, padding: 13, alignItems: 'center' },
  joinConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  proCard: { backgroundColor: Colors.primary + '12', borderRadius: 16, padding: 20, gap: 8, borderWidth: 1.5, borderColor: Colors.primary + '40' },
  proTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  proDesc: { fontSize: 14, color: Colors.textLight, lineHeight: 20 },
  proBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  proBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  dangerBtn: { borderWidth: 1, borderColor: Colors.error, borderRadius: 10, padding: 14, alignItems: 'center' },
  dangerBtnText: { fontSize: 15, color: Colors.error },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalCancel: { fontSize: 16, color: Colors.textLight },
  modalSave: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  modalContent: { padding: 20, gap: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  avatarBtnSelected: { borderColor: Colors.primary },
  avatarText: { fontSize: 28 },
  input: { backgroundColor: Colors.card, borderRadius: 10, padding: 14, fontSize: 16, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  tasteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tasteTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  tasteTagOn: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  tasteTagText: { fontSize: 14, color: Colors.textLight },
  tasteTagTextOn: { color: Colors.primary, fontWeight: '600' },
  sectionDivider: { textAlign: 'center', fontSize: 12, color: Colors.textLight, marginVertical: 4 },
  rowInputs: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1, gap: 4 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: { flex: 1, backgroundColor: Colors.card, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  genderBtnOn: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  genderText: { fontSize: 15, color: Colors.textLight },
  genderTextOn: { color: Colors.primary, fontWeight: '600' },
})

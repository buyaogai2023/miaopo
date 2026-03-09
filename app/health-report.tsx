import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Colors } from '../constants/colors'
import { useNutritionStore, NutritionLog } from '../store/nutritionStore'
import { useFamilyStore } from '../store/familyStore'
import { generateWeeklyHealthReport } from '../services/deepseek'

const DAY_NAMES: Record<string, string> = { '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六' }

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return d.toISOString().slice(0, 10)
  })
}

export default function HealthReport() {
  const { logs, feedbacks, loadLogs, loadFeedbacks, getWeekLogs } = useNutritionStore()
  const { members, load: loadFamily } = useFamilyStore()
  const [report, setReport] = useState<{ summary: string; achievements: string[]; warnings: string[]; next_week_tips: string[] } | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const last7 = getLast7Days()

  useEffect(() => {
    Promise.all([loadLogs(), loadFeedbacks(), loadFamily()])
  }, [])

  const weekLogs = getWeekLogs()
  const totalMeals = weekLogs.length
  const avgCalories = totalMeals ? Math.round(weekLogs.reduce((s, l) => s + l.calories, 0) / Math.max(new Set(weekLogs.map(l => l.date)).size, 1)) : 0
  const avgProtein = totalMeals ? Math.round(weekLogs.reduce((s, l) => s + l.protein, 0) / Math.max(new Set(weekLogs.map(l => l.date)).size, 1)) : 0
  const likedCount = feedbacks.filter(f => f.liked).length
  const dislikedCount = feedbacks.filter(f => !f.liked).length

  const getDayLogs = (date: string) => weekLogs.filter(l => l.date === date)
  const getDayCalories = (date: string) => getDayLogs(date).reduce((s, l) => s + l.calories, 0)
  const maxCalories = Math.max(...last7.map(d => getDayCalories(d)), 1)

  const generateReport = async () => {
    setReportLoading(true)
    try {
      const profiles = members.map(m => ({ name: m.name, health: m.health }))
      const result = await generateWeeklyHealthReport(weekLogs, profiles)
      setReport(result)
    } catch {}
    setReportLoading(false)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 记录用餐入口 */}
      <TouchableOpacity style={styles.logBtn} onPress={() => router.push('/log-meal')}>
        <Text style={styles.logBtnText}>+ 记录用餐</Text>
      </TouchableOpacity>

      {/* 本周总览 */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>📊 本周饮食总览</Text>
        <View style={styles.statsRow}>
          <Stat label="记录餐次" value={totalMeals.toString()} unit="餐" />
          <Stat label="日均热量" value={avgCalories.toString()} unit="千卡" />
          <Stat label="日均蛋白质" value={avgProtein.toString()} unit="g" />
        </View>
        <View style={styles.statsRow}>
          <Stat label="喜欢推荐" value={likedCount.toString()} unit="次 👍" />
          <Stat label="跳过推荐" value={dislikedCount.toString()} unit="次 👎" />
          <Stat label="达标天数" value={last7.filter(d => getDayCalories(d) > 0).length.toString()} unit="天" />
        </View>
      </View>

      {/* 7天热量柱状图 */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>🔥 7天热量趋势</Text>
        <View style={styles.chart}>
          {last7.map((date, i) => {
            const cal = getDayCalories(date)
            const height = cal > 0 ? Math.max((cal / maxCalories) * 100, 8) : 4
            const dayOfWeek = new Date(date).getDay().toString()
            const isToday = date === new Date().toISOString().slice(0, 10)
            return (
              <View key={date} style={styles.barCol}>
                <Text style={styles.barValue}>{cal > 0 ? cal : ''}</Text>
                <View style={styles.barBg}>
                  <View style={[styles.bar, { height: `${height}%` }, isToday && styles.barToday, cal === 0 && styles.barEmpty]} />
                </View>
                <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                  {isToday ? '今' : `周${DAY_NAMES[dayOfWeek]}`}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* 本周进食记录 */}
      {weekLogs.length > 0 && (
        <View style={styles.logCard}>
          <Text style={styles.cardTitle}>🍽 本周饮食记录</Text>
          {[...last7].reverse().map(date => {
            const dayLogs = getDayLogs(date)
            if (!dayLogs.length) return null
            const dayOfWeek = new Date(date).getDay().toString()
            return (
              <View key={date} style={styles.dayGroup}>
                <Text style={styles.dayTitle}>周{DAY_NAMES[dayOfWeek]} {date.slice(5)}</Text>
                {dayLogs.map((log, i) => (
                  <View key={i} style={styles.logRow}>
                    <Text style={styles.logMeal}>{log.meal}</Text>
                    <Text style={styles.logTitle}>{log.title}</Text>
                    <Text style={styles.logCal}>{log.calories}千卡</Text>
                  </View>
                ))}
              </View>
            )
          })}
        </View>
      )}

      {/* AI 健康周报 */}
      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <Text style={styles.cardTitle}>🤖 AI 健康分析</Text>
          <TouchableOpacity style={styles.generateBtn} onPress={generateReport} disabled={reportLoading}>
            <Text style={styles.generateBtnText}>{reportLoading ? '分析中...' : '生成报告'}</Text>
          </TouchableOpacity>
        </View>

        {reportLoading && (
          <View style={styles.reportLoading}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.reportLoadingText}>AI 正在分析本周饮食数据...</Text>
          </View>
        )}

        {report && !reportLoading && (
          <>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>{report.summary}</Text>
            </View>
            {report.achievements.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎉 本周成就</Text>
                {report.achievements.map((a, i) => (
                  <Text key={i} style={styles.achieveItem}>✅ {a}</Text>
                ))}
              </View>
            )}
            {report.warnings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⚠️ 需要注意</Text>
                {report.warnings.map((w, i) => (
                  <Text key={i} style={styles.warningItem}>• {w}</Text>
                ))}
              </View>
            )}
            {report.next_week_tips.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 下周建议</Text>
                {report.next_week_tips.map((t, i) => (
                  <Text key={i} style={styles.tipItem}>{i + 1}. {t}</Text>
                ))}
              </View>
            )}
          </>
        )}

        {!report && !reportLoading && weekLogs.length === 0 && (
          <Text style={styles.noDataText}>本周还没有饮食记录。在首页点击"已吃"记录用餐后，AI 将为您生成个性化健康分析。</Text>
        )}
        {!report && !reportLoading && weekLogs.length > 0 && (
          <Text style={styles.noDataText}>点击"生成报告"获取本周 AI 健康分析</Text>
        )}
      </View>
    </ScrollView>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  summaryCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  statUnit: { fontSize: 11, color: Colors.textLight },
  statLabel: { fontSize: 11, color: Colors.textLight },
  chartCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 9, color: Colors.textLight, height: 12 },
  barBg: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: Colors.primary + '60', borderRadius: 4, minHeight: 4 },
  barToday: { backgroundColor: Colors.primary },
  barEmpty: { backgroundColor: Colors.border },
  barLabel: { fontSize: 10, color: Colors.textLight },
  barLabelToday: { color: Colors.primary, fontWeight: '700' },
  logCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 8 },
  dayGroup: { gap: 4 },
  dayTitle: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  logMeal: { fontSize: 12, color: Colors.textLight, width: 32 },
  logTitle: { flex: 1, fontSize: 14, color: Colors.text },
  logCal: { fontSize: 12, color: Colors.textLight },
  reportCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 12 },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  generateBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  generateBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  reportLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 8 },
  reportLoadingText: { fontSize: 13, color: Colors.textLight },
  summaryBox: { backgroundColor: Colors.primary + '12', borderRadius: 10, padding: 12 },
  summaryText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  achieveItem: { fontSize: 13, color: '#28a745', lineHeight: 20 },
  warningItem: { fontSize: 13, color: '#dc3545', lineHeight: 20 },
  tipItem: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  noDataText: { fontSize: 13, color: Colors.textLight, lineHeight: 20, textAlign: 'center', paddingVertical: 8 },
  logBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  logBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})

# 妙谱 (MiaoPu) 项目上下文

## 项目简介
AI 智能菜谱管理 APP，目标中国市场。React Native + Expo SDK 54。

## 技术栈
- React Native + Expo SDK 54 (Node 20)
- expo-router v6 (文件路由)
- Zustand (状态管理，本地 AsyncStorage)
- AI: DashScope (qwen3.5-plus-2026-02-15) — sk-9e9c16fa845349f98214e473b5148f96
- 数据: AsyncStorage + Supabase (family_shopping 表已建)

## 运行方式
```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx expo start --tunnel --port 8082
```
Tunnel URL: exp://glkx3l8-anonymous-8082.exp.direct

## 文件结构
- app/(tabs)/index.tsx     菜谱库首页
- app/(tabs)/fridge.tsx    冰箱管理（拍照识别+有效期提醒）
- app/(tabs)/meal-plan.tsx 一周餐计划（AI生成+手动）
- app/(tabs)/shopping.tsx  购物清单（家庭同步）
- app/(tabs)/profile.tsx   我的（家庭成员+口味档案+订阅）
- app/cook/[id].tsx        烹饪模式（步骤+计时）
- app/suggest.tsx          根据冰箱推荐菜谱
- app/recipe/[id].tsx      菜谱详情
- components/FloatingChef.tsx  悬浮AI大厨（全局聊天）
- services/aiChef.ts       AI大厨逻辑（流式streaming）
- services/deepseek.ts     菜谱提取/冰箱识别/推荐/一周菜单
- store/recipeStore.ts     菜谱状态
- store/shoppingStore.ts   购物清单（Supabase同步）
- store/chatStore.ts       AI大厨聊天状态（Zustand全局）
- store/familyStore.ts     家庭成员+口味档案

## 当前进度
- ✅ AI 提取菜谱（粘贴文字/链接）
- ✅ 菜谱库（保存、查看、删除）
- ✅ 购物清单（Supabase 家庭同步）
- ✅ 冰箱管理（拍照识别 + 手动 + 有效期提醒）
- ✅ 一周餐计划（AI一键生成 + 手动）
- ✅ 烹饪模式（步骤+计时器）
- ✅ AI 大厨悬浮聊天（全屏，可控制全部APP数据）
- ✅ 家庭成员 + 口味档案
- ✅ 购物清单家庭共享（Supabase family_shopping）
- ⏳ 语音输入（需苹果开发者账号 EAS 构建）
- ⏳ Apple ID 登录 + 个人云端同步
- ⏳ 上架 App Store

## 待办（下次继续）
1. 苹果开发者账号 → EAS 构建 → 语音输入上线
2. Apple ID 登录 + Supabase 用户数据同步
3. 打包上架

## AI API
- 当前: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
- 模型: qwen3.5-plus-2026-02-15
- API Key: sk-9e9c16fa845349f98214e473b5148f96
- Supabase: https://hrxljtjrteunldtwtwrz.supabase.co

<!-- AUTO: 最后活跃 2026-03-09 12:07 -->

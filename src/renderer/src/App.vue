<script setup>
import { ref, onMounted, onBeforeUnmount, computed, provide, nextTick } from 'vue'
import AccountManager from './components/AccountManager.vue'
import WarehouseLabeling from './components/WarehouseLabeling.vue'
import InventoryClearance from './components/InventoryClearance.vue'
import ReturnStorage from './components/ReturnStorage.vue'
import {
  getSessionStatus,
  createSession,
  logout as logoutApi
} from './services/apiService'
import {
  clearSelections
} from './utils/storageHelper'
import webSocketService from './services/webSocketService'
import { useSubscription } from './composables/useSubscription'

// --- State Management ---
const isDev = ref(process.env.NODE_ENV === 'development')
const appState = ref('loading') // 'loading', 'login', 'main'
const sessionContext = ref(null)
provide('sessionContext', sessionContext)
const accountManagerRef = ref(null)

// --- 订阅状态管理 ---
const {
  subscriptionInfo,
  subscriptionLoading,
  remainingDays,
  loadSubscriptionInfo,
  renewSubscription
} = useSubscription(sessionContext)

// --- Authorization & Initialization Flow ---
const initializeApp = async () => {
  appState.value = 'loading'
  try {
    // 1. 始终从服务器获取会话状态.
    const status = await getSessionStatus()
    if (status.loggedIn && status.context) {
      console.log('会话恢复成功 (来自后端)')
      sessionContext.value = status.context
      appState.value = 'main'

      // 进入主界面后立即加载订阅信息
      await loadSubscriptionInfo()
      return
    }
  } catch (error) {
    console.error('自动恢复或创建会话失败:', error)
  }

  // 2. 如果服务器没有会话，则要求用户登录.
  console.log('无法自动恢复会话，请手动登录。')
  sessionContext.value = null
  appState.value = 'login'
}

const onLoginSuccess = async (context) => {
  if (context) {
    console.log('登录和会话创建完全成功，进入主应用。')
    sessionContext.value = context
    appState.value = 'main'

    // 登录成功后立即加载订阅信息
    await loadSubscriptionInfo()
  } else {
    console.error('onLoginSuccess被调用，但没有有效的会话上下文。')
    appState.value = 'login'
  }
}

const handleLogout = async () => {
  console.log('正在执行前端登出操作...')

  try {
    // 1. 调用后端登出接口
    console.log('【调试】App.vue: 调用后端登出接口')
    await logoutApi()
    console.log('【调试】App.vue: 后端会话已清除')
  } catch (error) {
    console.error('【调试】App.vue: 后端登出失败:', error)
    // 即使后端登出失败，也继续执行前端登出流程
  }

  // 2. 清除前端状态
  console.log('【调试】App.vue: 清除会话上下文和本地存储')
  sessionContext.value = null
  clearSelections() // Clear local storage

  // 3. 清除所有本地存储
  localStorage.clear()
  sessionStorage.clear()

  // 4. 清除所有 IndexedDB 数据库
  try {
    console.log('【调试】App.vue: 清除 IndexedDB 数据库')
    const databases = await window.indexedDB.databases()
    for (const db of databases) {
      window.indexedDB.deleteDatabase(db.name)
    }
  } catch (error) {
    console.error('【调试】App.vue: 清除 IndexedDB 失败:', error)
  }

  // 5. 清除所有缓存（如果可用）
  if (window.caches) {
    try {
      console.log('【调试】App.vue: 清除缓存存储')
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
    } catch (error) {
      console.error('【调试】App.vue: 清除缓存失败:', error)
    }
  }

  // 6. 更新应用状态
  console.log('【调试】App.vue: 将应用状态设置为 login')
  appState.value = 'login'

  // 7. 调用 Electron 清除 Cookies
  if (window.api) {
    console.log('【调试】App.vue: 调用 window.api.clearCookies()')
    try {
      await window.api.clearCookies()
      console.log('【调试】App.vue: Cookies 已清除')
    } catch (error) {
      console.error('【调试】App.vue: 清除 Cookies 失败:', error)
    }
  } else {
    console.error('【调试】App.vue: window.api 不存在，无法清除 cookies')
  }

  // 8. 重新连接 WebSocket
  console.log('【调试】App.vue: 重新连接 WebSocket')
  webSocketService.close()
  setTimeout(() => {
    webSocketService.connect()
  }, 500)
}

// --- Lifecycle Hooks ---
onMounted(() => {
  console.log('App.vue onMounted: 应用已挂载')
  webSocketService.connect()
  initializeApp()

  // Listen for successful login from the main process
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.on('login-successful', (event, cookies) => {
      console.log('App.vue: 收到来自主进程的 login-successful 信号。')

      // 确保应用状态为登录状态
      appState.value = 'login'

      // 使用 nextTick 确保 AccountManager 组件已经渲染
      nextTick(() => {
        if (accountManagerRef.value) {
          accountManagerRef.value.handleLoginSuccess(cookies)
        } else {
          console.error('AccountManager 组件引用不可用，尝试延迟处理...')
          // 如果组件引用不可用，使用延迟
          setTimeout(() => {
            if (accountManagerRef.value) {
              console.log('延迟后找到 AccountManager 组件引用，处理登录成功信号')
              accountManagerRef.value.handleLoginSuccess(cookies)
            } else {
              console.error('即使延迟后，AccountManager 组件引用仍不可用')
              // 尝试直接使用 cookies 创建会话
              createSession(cookies)
                .then((response) => {
                  if (response.success) {
                    console.log('直接创建会话成功，跳过 AccountManager 组件')
                    onLoginSuccess(response.context)
                  }
                })
                .catch((error) => {
                  console.error('直接创建会话失败:', error)
                })
            }
          }, 500)
        }
      })
    })
  }
})

onBeforeUnmount(() => {
  webSocketService.close()
})

// --- UI State & Components ---
const activeTab = ref('入仓打标')
const tabComponents = {
  入仓打标: WarehouseLabeling,
  清库下标: InventoryClearance,
  退货入库: ReturnStorage
}
const currentComponent = computed(() => tabComponents[activeTab.value])
const showDebugPanel = ref(false)
const toggleDebugPanel = () => (showDebugPanel.value = !showDebugPanel.value)
</script>

<template>
  <div class="app-container">
    <div v-if="appState === 'loading'" class="loading-overlay">
      <div class="spinner"></div>
      <p>正在加载应用...</p>
    </div>

    <div v-else-if="appState === 'login'" class="login-view">
      <AccountManager
        ref="accountManagerRef"
        @login-success="onLoginSuccess"
        @logout="handleLogout"
      />
    </div>

    <div v-else-if="appState === 'main'" class="main-layout">
      <header class="app-header">
        <div class="header-left">
          <h1>京东仓储一体化工具</h1>

          <!-- 订阅信息显示 - 放在标题右侧 -->
          <div
            v-if="
              subscriptionInfo &&
              subscriptionInfo.data &&
              subscriptionInfo.data.currentStatus &&
              subscriptionInfo.data.currentStatus.isValid
            "
            class="subscription-status"
          >
            <span class="subscription-text">
              订阅剩余：{{ remainingDays }}天 ({{ subscriptionInfo.data.validUntilFormatted }})
            </span>
            <button
              class="refresh-btn"
              @click="loadSubscriptionInfo"
              :disabled="subscriptionLoading"
              title="刷新订阅状态"
            >
              {{ subscriptionLoading ? '⟳' : '🔄' }}
            </button>
            <button class="renew-btn" @click="renewSubscription" title="续费订阅">续费</button>
          </div>

          <!-- 如果正在加载订阅信息 -->
          <div v-else-if="subscriptionLoading" class="subscription-loading">
            <span>正在加载订阅信息...</span>
          </div>

          <!-- 如果订阅无效或加载失败 -->
          <div
            v-else-if="
              subscriptionInfo &&
              (!subscriptionInfo.success || !subscriptionInfo.data?.currentStatus?.isValid)
            "
            class="subscription-invalid"
          >
            <span>订阅无效或已过期</span>
            <button class="renew-btn" @click="renewSubscription">立即续费</button>
          </div>
        </div>
        <div class="header-right">
          <span class="username">{{ sessionContext?.supplierInfo?.name || '未登录' }}</span>
          <button @click="handleLogout" class="logout-button">退出登录</button>
        </div>
      </header>

      <div class="main-body">
        <div v-if="showDebugPanel" class="debug-panel">
          <h3>调试信息</h3>
          <pre>{{ JSON.stringify(sessionContext, null, 2) }}</pre>
        </div>
        <div class="tabs">
          <button
            v-for="(_, tabName) in tabComponents"
            :key="tabName"
            @click="activeTab = tabName"
            :class="{ active: activeTab === tabName }"
            class="tab-button"
          >
            {{ tabName }}
          </button>
        </div>
        <main class="main-content">
          <keep-alive>
            <component :is="currentComponent" />
          </keep-alive>
        </main>
      </div>
    </div>
  </div>
</template>

<style>
/* General App Styles */
html,
body,
#app,
.app-container {
  height: 100%;
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: #f0f2f5;
  overflow: hidden;
}

/* Loading Overlay */
.loading-overlay {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #666;
}
.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Login View */
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

/* Main App Layout */
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.debug-panel {
  padding: 16px;
  background-color: #f0f0f0;
  border-bottom: 1px solid #ccc;
  max-height: 300px; /* 增加最大高度 */
  overflow-y: auto;
  font-family: monospace;
  color: #333; /* 设置清晰的文字颜色 */
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background-color: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  height: 32px;
}

h1 {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  font-weight: 500;
}

.logout-button,
.debug-toggle-button {
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background-color: #fff;
  cursor: pointer;
  transition: all 0.3s;
}

.logout-button:hover,
.debug-toggle-button:hover {
  border-color: #40a9ff;
  color: #40a9ff;
}

.main-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: hidden;
}

.tabs {
  display: flex;
  background-color: #fff;
  padding: 0 24px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.tab-button {
  padding: 12px 16px;
  border: none;
  background-color: transparent;
  cursor: pointer;
  font-size: 16px;
  color: #555;
  border-bottom: 3px solid transparent;
  transition: all 0.3s;
}

.tab-button.active {
  color: #1890ff;
  font-weight: 600;
  border-bottom-color: #1890ff;
}

.main-content {
  flex-grow: 1;
  padding: 24px;
  background-color: #f0f2f5;
  overflow: auto; /* Allow content to scroll */
}

/* 订阅状态样式 - 简洁版本 */
.subscription-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
}

.subscription-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
}

.subscription-invalid {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
}

.subscription-text {
  color: #666;
  font-size: 14px;
  font-weight: normal;
}

.refresh-btn,
.renew-btn {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background-color: #fff;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  transition: all 0.2s;
  color: #666;
}

.refresh-btn:hover:not(:disabled) {
  border-color: #40a9ff;
  color: #40a9ff;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.renew-btn:hover {
  border-color: #40a9ff;
  color: #40a9ff;
}
</style>

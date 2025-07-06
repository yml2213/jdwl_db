<script setup>
import { ref, onMounted, onBeforeUnmount, computed, provide } from 'vue'
import AccountManager from './components/AccountManager.vue'
import WarehouseLabeling from './components/WarehouseLabeling.vue'
import InventoryClearance from './components/InventoryClearance.vue'
import ReturnStorage from './components/ReturnStorage.vue'
import { getSessionStatus, createSession } from './services/apiService'
import electronLogo from './assets/electron.svg'
import {
  clearSelections,
  clearAppSettings,
  getSelectedDepartment,
  getSelectedVendor
} from './utils/storageHelper'
import { getAllCookies } from '@/utils/cookieHelper'
import webSocketService from './services/webSocketService'

// --- State Management ---
const isDev = ref(process.env.NODE_ENV === 'development')
const appState = ref('loading') // 'loading', 'login', 'main'
const sessionContext = ref(null)
provide('sessionContext', sessionContext)
const accountManagerRef = ref(null)

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

const onLoginSuccess = (context) => {
  if (context) {
    console.log('登录和会话创建完全成功，进入主应用。')
    sessionContext.value = context
    appState.value = 'main'
  } else {
    console.error('onLoginSuccess被调用，但没有有效的会话上下文。')
    appState.value = 'login'
  }
}

const handleLogout = () => {
  console.log('正在执行前端登出操作...')
  sessionContext.value = null
  clearSelections() // Clear local storage
  appState.value = 'login'
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
      if (accountManagerRef.value) {
        accountManagerRef.value.handleLoginSuccess(cookies)
      } else {
        console.error('AccountManager component reference is not available.')
      }
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
        </div>
        <div class="header-right">
          <div class="dev-info-container" v-if="isDev">
            <button @click="toggleDebugPanel" class="debug-toggle-button">
              {{ showDebugPanel ? '隐藏' : '显示' }}调试信息
            </button>
          </div>
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
</style>

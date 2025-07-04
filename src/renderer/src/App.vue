<script setup>
import { ref, onMounted, onBeforeUnmount, computed, provide, watch } from 'vue'
import AccountManager from './components/AccountManager.vue'
import WarehouseLabeling from './components/WarehouseLabeling.vue'
import InventoryClearance from './components/InventoryClearance.vue'
import ReturnStorage from './components/ReturnStorage.vue'
import { getSessionStatus, initSession, createSession } from './services/apiService'
import electronLogo from './assets/electron.svg'
import {
  clearSelections,
  clearAppSettings,
  getSelectedDepartment,
  getSelectedVendor,
  getSelectedShop,
  getSelectedWarehouse
} from './utils/storageHelper'
import { getAllCookies } from '@/utils/cookieHelper'

// 开发模式标志
const isDev = ref(process.env.NODE_ENV === 'development')

// 统一的会话上下文
const sessionContext = ref(null)
const isInitialized = ref(false) // 添加初始化状态标记
// 添加应用启动状态管理
const appState = ref('loading') // 'loading', 'login', 'main'

// 登录状态现在是一个计算属性，更可靠
const isLoggedIn = computed(() => {
  const loggedIn = !!sessionContext.value
  console.log(
    '计算 isLoggedIn 状态:',
    loggedIn,
    '会话上下文:',
    sessionContext.value ? '有值' : '无值'
  )
  return loggedIn
})

// 添加 watch 来监控 isLoggedIn 的变化
watch(isLoggedIn, (newVal) => {
  console.log('登录状态发生变化:', newVal)
  // 登录状态变化时更新应用状态
  if (newVal) {
    appState.value = 'main'
  } else if (appState.value !== 'loading') {
    appState.value = 'login'
  }
})

// 将会话上下文提供给所有子组件
provide('sessionContext', sessionContext)

/**
 * @description 执行初始化流程，包括调用后端API获取操作ID
 * @returns {Promise<void>}
 */
const performInit = async () => {
  if (isInitialized.value) return // 防止重入

  console.log('开始执行应用初始化流程...')
  try {
    isInitialized.value = true // 立即设置状态，防止重入
    const result = await initSession()
    if (result.success) {
      console.log('应用初始化成功，获取到的 operationId:', result.operationId)
    } else {
      console.error('应用初始化失败:', result.message)
      isInitialized.value = false // 失败时允许重试
    }
  } catch (error) {
    console.error('执行初始化流程时出错:', error)
    isInitialized.value = false // 异常时允许重试
  }
}

/**
 * @description 检查服务器上的会话状态，并在会话有效时恢复它
 */
const checkSessionStatus = async () => {
  console.log('开始检查后端会话状态...')
  try {
    const status = await getSessionStatus()
    console.log('收到会话状态响应:', status)

    if (status.loggedIn && status.context) {
      console.log('后端会话有效，准备恢复会话上下文...', status.context)
      handleSessionRestored(status.context)
      return true
    } else {
      console.log(
        '后端会话无效或未登录, status.loggedIn =',
        status.loggedIn,
        ', status.context =',
        !!status.context
      )
      sessionContext.value = null
      return false
    }
  } catch (error) {
    console.error('检查会话状态失败:', error)
    sessionContext.value = null
    return false
  }
}

/**
 * 尝试使用本地存储的数据自动恢复会话
 */
const tryAutoRestoreSession = async () => {
  console.log('尝试自动恢复会话...')
  try {
    const cookies = await getAllCookies()
    console.log('获取到 cookies:', cookies?.length || 0)
    const vendorInfo = getSelectedVendor()
    console.log('本地存储中的供应商信息:', vendorInfo?.name)
    const departmentInfo = getSelectedDepartment()
    console.log('本地存储中的事业部信息:', departmentInfo?.name)

    if (cookies && cookies.length > 0 && vendorInfo && departmentInfo) {
      const pinCookie = cookies.find((c) => c.name === 'pin')
      if (pinCookie) {
        console.log('找到 pin cookie:', pinCookie.value)
        const sessionData = {
          uniqueKey: `${pinCookie.value}-${departmentInfo.id}`,
          cookies,
          supplierInfo: vendorInfo,
          departmentInfo
        }

        console.log('发现本地凭据，尝试创建会话...')
        const sessionResult = await createSession(sessionData)
        console.log('会话创建结果:', sessionResult)

        // 重新检查会话状态
        const restored = await checkSessionStatus()
        console.log('会话恢复后检查登录状态:', isLoggedIn.value)

        if (restored) {
          console.log('会话自动恢复成功, 开始执行初始化...')
          await performInit()
          console.log('应用初始化完成')
          return true
        } else {
          console.warn('会话恢复后仍未登录，可能需要重新登录')
        }
      } else {
        console.warn('未找到 pin cookie，无法自动恢复会话')
      }
    } else {
      console.warn(
        '缺少自动恢复会话所需的数据:',
        cookies ? '有cookies' : '无cookies',
        vendorInfo ? '有供应商' : '无供应商',
        departmentInfo ? '有事业部' : '无事业部'
      )
    }
  } catch (error) {
    console.error('自动恢复会话失败:', error)
  }
  return false
}

const handleSessionCreated = async () => {
  console.log('handleSessionCreated: 会话创建/重建成功事件被触发，正在从服务器获取最新会话状态...')
  await checkSessionStatus()
  // 检查通过后，sessionContext 会被设置，此时可以进行初始化
  console.log('handleSessionCreated: 会话检查完成，当前登录状态:', isLoggedIn.value)
  if (isLoggedIn.value) {
    console.log('handleSessionCreated: 已登录，开始执行初始化...')
    await performInit()
  } else {
    console.warn('handleSessionCreated: 会话创建后检查状态，但未登录，请排查问题')
  }
}

/**
 * @description 当会话被恢复时调用
 * @param {object} context - 从后端获取的会话上下文
 */
const handleSessionRestored = (context) => {
  console.log('handleSessionRestored: 设置会话上下文...', context)
  sessionContext.value = context
  console.log('handleSessionRestored: 会话已恢复，设置后的登录状态:', isLoggedIn.value)
  performInit() // 恢复会话后也执行初始化
}

// 处理退出登录
const handleLogout = () => {
  console.log('正在执行前端登出操作...')
  sessionContext.value = null
  isInitialized.value = false // 重置初始化状态
  clearSelections()
  console.log('前端登出完成。')
  appState.value = 'login'
}

// 当前活动标签
const activeTab = ref('入仓打标')

const tabComponents = {
  入仓打标: WarehouseLabeling,
  清库下标: InventoryClearance,
  退货入库: ReturnStorage
}

const currentComponent = computed(() => tabComponents[activeTab.value])

// 创建一个任务列表的全局状态，以便在标签页切换时保持
const globalTaskList = ref([])

// 提供全局任务列表给所有组件使用
provide('globalTaskList', globalTaskList)

// 当前的供应商和事业部信息（用于开发模式展示）
const currentVendor = computed(() => getSelectedVendor())
const currentDepartment = computed(() => getSelectedDepartment())
const currentShop = computed(() => getSelectedShop())
const currentWarehouse = computed(() => getSelectedWarehouse())

// 调试信息面板是否显示
const showDebugPanel = ref(false)

// 复制提示状态
const copyTip = ref({
  show: false,
  section: '',
  timer: null
})

// 切换调试面板显示状态
const toggleDebugPanel = () => {
  showDebugPanel.value = !showDebugPanel.value
}

// 复制到剪贴板
const copyToClipboard = (text, section) => {
  const tempInput = document.createElement('input')
  tempInput.value = text
  document.body.appendChild(tempInput)
  tempInput.select()
  document.execCommand('copy')
  document.body.removeChild(tempInput)

  // 显示复制成功提示
  if (copyTip.value.timer) {
    clearTimeout(copyTip.value.timer)
  }

  copyTip.value = {
    show: true,
    section: section,
    timer: setTimeout(() => {
      copyTip.value.show = false
    }, 2000)
  }
}

// 清除缓存并重载页面
const handleClearCacheAndReload = () => {
  clearAppSettings()
  alert('缓存已清除，应用即将刷新。')
  window.location.reload()
}

// 组件挂载时检查会话状态
onMounted(async () => {
  console.log('App 组件挂载，开始会话检查流程...')
  appState.value = 'loading' // 确保应用初始状态为加载中

  // 首先尝试检查现有会话状态
  const hasSession = await checkSessionStatus()

  // 如果没有现有会话，尝试自动恢复
  if (!hasSession) {
    const restored = await tryAutoRestoreSession()

    // 如果仍然没有恢复成功，显示登录界面
    if (!restored) {
      console.log('无法自动恢复会话，显示登录界面')
      appState.value = 'login'
    }
  } else {
    // 已有会话，直接执行初始化
    console.log('已经登录，执行应用初始化')
    await performInit()
    appState.value = 'main'
  }

  // 添加额外检查，用于排查问题
  console.log('App挂载完成后的最终状态检查:')
  console.log('- isLoggedIn:', isLoggedIn.value)
  console.log('- sessionContext存在:', !!sessionContext.value)
  console.log('- 显示的界面:', appState.value)
})

onBeforeUnmount(() => {
  // 不再需要监听任何事件
})

// 选择JSON内容
const selectJsonContent = (event) => {
  const pre = event.target
  if (pre && pre.tagName === 'PRE') {
    const text = pre.textContent
    if (text) {
      // 获取父元素的标题作为部分名称
      const sectionHeader = pre.parentElement.querySelector('.section-header h4')
      const sectionName = sectionHeader ? sectionHeader.textContent : ''
      copyToClipboard(text, sectionName)
    }
  }
}
</script>

<template>
  <div class="app-container">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="header-left">
        <h1 class="app-title">订单下载系统 - 云打标工具</h1>
      </div>
      <div class="header-right">
        <AccountManager
          v-if="appState === 'main'"
          @session-created="handleSessionCreated"
          @logout="handleLogout"
        />
        <button v-if="isDev" @click="toggleDebugPanel" class="debug-toggle">
          {{ showDebugPanel ? '隐藏调试' : '显示调试' }}
        </button>
      </div>
    </header>

    <!-- 开发模式调试面板 -->
    <div v-if="isDev && showDebugPanel" class="debug-panel">
      <div class="debug-actions">
        <button @click="handleClearCacheAndReload" class="btn btn-warning">清除缓存并重启</button>
      </div>
      <h3>当前用户数据 (localStorage)</h3>
      <div class="debug-section">
        <div class="section-header">
          <h4>供应商信息</h4>
          <button
            v-if="currentVendor"
            @click="copyToClipboard(JSON.stringify(currentVendor, null, 2), '供应商')"
            class="copy-btn"
          >
            复制
          </button>
          <span v-if="copyTip.show && copyTip.section === '供应商'" class="copy-tip">✓ 已复制</span>
        </div>
        <pre v-if="currentVendor" class="json-display" @click="selectJsonContent">{{
          JSON.stringify(currentVendor, null, 2)
        }}</pre>
        <div v-else class="empty-data">未选择供应商</div>
      </div>
      <div class="debug-section">
        <div class="section-header">
          <h4>事业部信息</h4>
          <button
            v-if="currentDepartment"
            @click="copyToClipboard(JSON.stringify(currentDepartment, null, 2), '事业部')"
            class="copy-btn"
          >
            复制
          </button>
          <span v-if="copyTip.show && copyTip.section === '事业部'" class="copy-tip">✓ 已复制</span>
        </div>
        <pre v-if="currentDepartment" class="json-display" @click="selectJsonContent">{{
          JSON.stringify(currentDepartment, null, 2)
        }}</pre>
        <div v-else class="empty-data">未选择事业部</div>
      </div>
      <div class="debug-section">
        <div class="section-header">
          <h4>店铺信息</h4>
          <button
            v-if="currentShop"
            @click="copyToClipboard(JSON.stringify(currentShop, null, 2), '店铺')"
            class="copy-btn"
          >
            复制
          </button>
          <span v-if="copyTip.show && copyTip.section === '店铺'" class="copy-tip">✓ 已复制</span>
        </div>
        <pre v-if="currentShop" class="json-display" @click="selectJsonContent">{{
          JSON.stringify(currentShop, null, 2)
        }}</pre>
        <div v-else class="empty-data">未选择店铺</div>
      </div>
      <div class="debug-section">
        <div class="section-header">
          <h4>仓库信息</h4>
          <button
            v-if="currentWarehouse"
            @click="copyToClipboard(JSON.stringify(currentWarehouse, null, 2), '仓库')"
            class="copy-btn"
          >
            复制
          </button>
          <span v-if="copyTip.show && copyTip.section === '仓库'" class="copy-tip">✓ 已复制</span>
        </div>
        <pre v-if="currentWarehouse" class="json-display" @click="selectJsonContent">{{
          JSON.stringify(currentWarehouse, null, 2)
        }}</pre>
        <div v-else class="empty-data">未选择仓库</div>
      </div>
    </div>

    <!-- 加载中状态 -->
    <div v-if="appState === 'loading'" class="loading-container">
      <div class="spinner"></div>
      <p>正在加载应用数据...</p>
    </div>

    <!-- 主体内容区 -->
    <div class="main-body" v-else-if="appState === 'main'">
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
          <component :is="currentComponent" :is-logged-in="isLoggedIn" />
        </keep-alive>
      </main>
    </div>

    <!-- 登录界面 -->
    <div v-else-if="appState === 'login'" class="login-prompt">
      <img :src="electronLogo" alt="Electron logo" class="logo" />
      <div class="login-card">
        <div class="card-header">
          <h2>欢迎使用云打标工具</h2>
          <p>请登录您的京东账号以开始使用所有功能</p>
        </div>
        <div class="card-divider"></div>
        <div class="card-footer">
          <AccountManager
            class="login-button-container"
            display-mode="central"
            @session-created="handleSessionCreated"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f0f2f5;
  overflow: hidden; /* Prevent any overflow issues */
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #1e88e5;
  color: white;
  padding: 0 20px;
  height: 60px; /* Strict fixed height */
  min-height: 60px; /* Ensure minimum height */
  max-height: 60px; /* Enforce maximum height */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  flex: 0 0 auto; /* Don't allow flex growth/shrink */
  z-index: 10; /* Ensure it stays on top */
}

.header-left {
  display: flex;
  align-items: center;
}

.app-title {
  font-size: 18px;
  font-weight: 500;
}

.main-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  background-color: #f4f7fa;
  overflow: hidden;
}

.tabs {
  display: flex;
  background-color: #ffffff;
  padding: 10px 20px 0;
  border-bottom: 1px solid #e0e0e0;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  flex: 0 0 auto; /* Don't allow flex growth */
}

.tab-button {
  padding: 10px 20px;
  border: none;
  background-color: transparent;
  cursor: pointer;
  font-size: 16px;
  color: #666;
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
  transition: all 0.2s;
}

.tab-button.active {
  color: #1a66ff;
  font-weight: 600;
  border-bottom-color: #1a66ff;
}

.main-content {
  flex: 1 1 auto;
  display: flex;
  overflow: hidden; /* Let child components handle their own overflow */
}

.main-content > :deep(*) {
  flex: 1;
}

.login-prompt {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.login-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  box-shadow:
    0 15px 35px rgba(0, 0, 0, 0.1),
    0 5px 15px rgba(0, 0, 0, 0.05);
  width: 90%;
  max-width: 500px;
  animation: fadeIn 0.8s ease-out;
  border: 1px solid rgba(255, 255, 255, 0.8);
  transition: all 0.3s;
}

.debug-toggle {
  background-color: #673ab7;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.debug-panel {
  padding: 15px;
  background-color: #2c3e50;
  color: #ecf0f1;
  border-bottom: 2px solid #34495e;
  max-height: 40vh;
  overflow-y: auto;
}

.debug-actions {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #34495e;
}

.btn-warning {
  background-color: #e67e22;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-warning:hover {
  background-color: #d35400;
}

.debug-section {
  background-color: #34495e;
  border-radius: 4px;
  margin-bottom: 15px;
  padding: 10px;
  position: relative;
}

.debug-section h4 {
  margin-bottom: 8px;
  color: #ffeb3b;
  font-size: 14px;
}

.debug-panel pre {
  background-color: #1c2731;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #8bc34a;
}

.empty-data {
  color: #ff9800;
  font-style: italic;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.copy-btn {
  background-color: #673ab7;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.3s;
}

.copy-btn:hover {
  background-color: #7e57c2;
}

.json-display {
  background-color: #1c2731;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  max-width: 100%;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #8bc34a;
  user-select: all;
  cursor: pointer;
  position: relative;
}

.json-display::after {
  content: '点击复制';
  position: absolute;
  top: 5px;
  right: 5px;
  background-color: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.3s;
}

.json-display:hover::after {
  opacity: 1;
}

.copy-tip {
  margin-left: 10px;
  color: #8bc34a;
  font-size: 12px;
  font-weight: bold;
}

/* 新增加载动画样式 */
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 80vh;
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border-left-color: #2d8cf0;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>

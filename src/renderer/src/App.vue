<script setup>
import { ref, onMounted, computed, provide } from 'vue'
import AccountManager from './components/AccountManager.vue'
import WarehouseLabeling from './components/WarehouseLabeling.vue'
import InventoryClearance from './components/InventoryClearance.vue'
import ReturnStorage from './components/ReturnStorage.vue'
import { getSessionStatus } from './services/apiService'
import {
  clearSelections,
  getSelectedDepartment,
  getSelectedVendor,
  getSelectedShop,
  getSelectedWarehouse,
  getLocalStorage,
  setLocalStorage
} from './utils/storageHelper'

// 开发模式标志
const isDev = ref(process.env.NODE_ENV === 'development')

// 用户是否已登录
const isUserLoggedIn = ref(false)

// 检查登录状态 (注意：此函数现在主要用于登出和初始化)
const checkLoginStatus = async () => {
  const status = await getSessionStatus()
  isUserLoggedIn.value = status.loggedIn
  if (status.loggedIn) {
    console.log('会话有效，用户已登录。')
  } else {
    console.log('会话无效或已过期，用户未登录。')
  }
}

// 会话创建成功后的处理
const handleSessionCreated = () => {
  isUserLoggedIn.value = true
}

// 处理退出登录
const handleLogout = () => {
  setLocalStorage('sessionId', null) // 清除旧的标记（以防万一）
  isUserLoggedIn.value = false
  clearSelections()
  // TODO: 调用后端接口来使会话失效
}

// 当前活动标签
const activeTab = ref('入仓打标')

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

// 组件挂载时检查登录状态
onMounted(() => {
  checkLoginStatus()

  // 监听登录成功事件
  window.electron.ipcRenderer.on('login-successful', () => {
    alert('登录成功！请选择供应商和事业部。')
    // 只更新UI状态，不再创建会话
    checkLoginStatus()
  })

  // 监听登出事件
  window.electron.ipcRenderer.on('cookies-cleared', () => {
    alert('已退出登录')
    handleLogout()
  })
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
        <AccountManager @session-created="handleSessionCreated" @logout="handleLogout" />
        <!-- 开发模式下的调试按钮 -->
        <button v-if="isDev" @click="toggleDebugPanel" class="debug-toggle">
          {{ showDebugPanel ? '隐藏调试' : '显示调试' }}
        </button>
      </div>
    </header>

    <!-- 开发模式调试面板 -->
    <div v-if="isDev && showDebugPanel" class="debug-panel">
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

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 登录提示 -->
      <div v-if="!isUserLoggedIn" class="login-prompt">
        <p>请先登录京东账号</p>
      </div>

      <!-- 已登录内容 -->
      <div v-else class="logged-in-content">
        <!-- 标签页 -->
        <div class="tabs">
          <div
            v-for="tab in ['入仓打标', '清库下标', '退货入库']"
            :key="tab"
            :class="['tab', { active: activeTab === tab }]"
            @click="activeTab = tab"
          >
            {{ tab }}
          </div>
        </div>

        <!-- 所有组件同时渲染，但只有当前选中的可见 -->
        <div class="tab-contents">
          <div v-show="activeTab === '入仓打标'" class="tab-content">
            <WarehouseLabeling :isLoggedIn="isUserLoggedIn" />
          </div>
          <div v-show="activeTab === '清库下标'" class="tab-content">
            <InventoryClearance :isLoggedIn="isUserLoggedIn" />
          </div>
          <div v-show="activeTab === '退货入库'" class="tab-content">
            <ReturnStorage :isLoggedIn="isUserLoggedIn" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

body {
  background-color: #f5f5f5;
  color: #333;
  font-size: 14px;
}

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 顶部导航栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #2196f3;
  color: white;
  padding: 0 20px;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
}

.app-title {
  font-size: 18px;
  font-weight: 500;
}

/* 主内容区 */
.main-content {
  flex: 1;
  padding: 0;
}

.login-prompt {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 30px;
  text-align: center;
  max-width: 800px;
  margin: 30px auto;
}

.login-prompt p {
  color: #666;
  font-size: 16px;
}

.logged-in-content {
  display: flex;
  flex-direction: column;
}

/* 标签页 */
.tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 0;
  padding: 0 10px;
  background-color: #f5f5f5;
}

.tab {
  padding: 10px 20px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: #666;
}

.tab.active {
  color: #2196f3;
  border-bottom-color: #2196f3;
  background-color: #fff;
}

/* 未实现功能提示 */
.feature-not-implemented {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 30px;
  text-align: center;
  max-width: 800px;
  margin: 30px auto;
}

.feature-not-implemented p {
  color: #666;
  font-size: 16px;
}

/* 调试面板样式 */
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
  background-color: #263238;
  color: #eee;
  padding: 15px;
  border-bottom: 1px solid #37474f;
  overflow-x: auto;
  max-height: 70vh;
  overflow-y: auto;
}

.debug-panel h3 {
  margin-bottom: 10px;
  color: #8bc34a;
  font-size: 16px;
}

.debug-section {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #37474f;
  border-radius: 4px;
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

/* 添加标签内容样式 */
.tab-contents {
  position: relative;
}

.tab-content {
  width: 100%;
}
</style>

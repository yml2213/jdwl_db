<script setup>
import { ref, onMounted, computed } from 'vue'
import AccountManager from './components/AccountManager.vue'
import WarehouseLabeling from './components/WarehouseLabeling.vue'
import { isLoggedIn } from './utils/cookieHelper'
import {
  clearSelections,
  getSelectedDepartment,
  getSelectedVendor,
  getSelectedShop,
  getSelectedWarehouse
} from './utils/storageHelper'

// 开发模式标志
const isDev = ref(process.env.NODE_ENV === 'development')

// 用户是否已登录
const isUserLoggedIn = ref(false)

// 检查登录状态
const checkLoginStatus = async () => {
  const loggedIn = await isLoggedIn()
  isUserLoggedIn.value = loggedIn
}

// 处理退出登录
const handleLogout = () => {
  isUserLoggedIn.value = false
  clearSelections()
}

// 当前活动标签
const activeTab = ref('入仓打标')

// 当前的供应商和事业部信息（用于开发模式展示）
const currentVendor = computed(() => getSelectedVendor())
const currentDepartment = computed(() => getSelectedDepartment())
const currentShop = computed(() => getSelectedShop())
const currentWarehouse = computed(() => getSelectedWarehouse())

// 调试信息面板是否显示
const showDebugPanel = ref(false)

// 切换调试面板显示状态
const toggleDebugPanel = () => {
  showDebugPanel.value = !showDebugPanel.value
}

// 组件挂载时检查登录状态
onMounted(() => {
  checkLoginStatus()

  // 监听登录成功事件
  window.electron.ipcRenderer.on('login-successful', () => {
    alert('登录成功！')
    checkLoginStatus()
  })

  // 监听登出事件
  window.electron.ipcRenderer.on('cookies-cleared', () => {
    alert('已退出登录')
    handleLogout()
  })
})
</script>

<template>
  <div class="app-container">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="header-left">
        <h1 class="app-title">订单下载系统 - 云打标工具</h1>
        <div class="nav-links">
          <a href="#" class="nav-link active">首页</a>
          <a href="#" class="nav-link">功能测试</a>
        </div>
      </div>

      <div class="header-right">
        <AccountManager />
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
        <h4>供应商信息</h4>
        <pre v-if="currentVendor">{{ JSON.stringify(currentVendor, null, 2) }}</pre>
        <div v-else class="empty-data">未选择供应商</div>
      </div>
      <div class="debug-section">
        <h4>事业部信息</h4>
        <pre v-if="currentDepartment">{{ JSON.stringify(currentDepartment, null, 2) }}</pre>
        <div v-else class="empty-data">未选择事业部</div>
      </div>
      <div class="debug-section">
        <h4>店铺信息</h4>
        <pre v-if="currentShop">{{ JSON.stringify(currentShop, null, 2) }}</pre>
        <div v-else class="empty-data">未选择店铺</div>
      </div>
      <div class="debug-section">
        <h4>仓库信息</h4>
        <pre v-if="currentWarehouse">{{ JSON.stringify(currentWarehouse, null, 2) }}</pre>
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

        <!-- 根据当前选中的标签页显示对应的组件 -->
        <div v-if="activeTab === '入仓打标'">
          <WarehouseLabeling :isLoggedIn="isUserLoggedIn" />
        </div>
        <div v-else-if="activeTab === '清库下标'">
          <div class="feature-not-implemented">
            <p>清库下标功能开发中...</p>
          </div>
        </div>
        <div v-else-if="activeTab === '退货入库'">
          <div class="feature-not-implemented">
            <p>退货入库功能开发中...</p>
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
  margin-right: 30px;
}

.nav-links {
  display: flex;
}

.nav-link {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  padding: 0 15px;
  line-height: 60px;
  font-size: 14px;
}

.nav-link.active,
.nav-link:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.1);
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
</style>

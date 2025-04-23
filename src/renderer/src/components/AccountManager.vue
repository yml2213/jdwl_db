<template>
  <div class="account-manager">
    <h2>账号管理</h2>
    <div v-if="!isLoggedIn" class="login-section">
      <button @click="openLoginWindow" class="login-btn">京东账号登录</button>
    </div>
    <div v-else class="account-info">
      <div class="status-info">
        <span class="status-label">状态:</span>
        <span class="status-value">已登录</span>
      </div>
      <button @click="logout" class="logout-btn">退出登录</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { isLoggedIn as checkLogin, logout as clearLogin } from '../utils/cookieHelper'

// 登录状态
const isLoggedIn = ref(false)

// 打开登录窗口
const openLoginWindow = () => {
  window.api.openLoginWindow()
}

// 退出登录
const logout = () => {
  clearLogin()
  isLoggedIn.value = false
}

// 更新登录状态
const updateLoginStatus = async () => {
  isLoggedIn.value = await checkLogin()
}

// 事件监听器
const setupEventListeners = () => {
  // 登录成功后更新状态
  window.electron.ipcRenderer.on('login-successful', updateLoginStatus)
  // 清除cookies后更新状态
  window.electron.ipcRenderer.on('cookies-cleared', () => {
    isLoggedIn.value = false
  })
}

// 移除事件监听器
const removeEventListeners = () => {
  window.electron.ipcRenderer.removeAllListeners('login-successful')
  window.electron.ipcRenderer.removeAllListeners('cookies-cleared')
}

// 组件挂载时检查登录状态和设置事件监听
onMounted(() => {
  updateLoginStatus()
  setupEventListeners()
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  removeEventListeners()
})
</script>

<style scoped>
.account-manager {
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
  margin-top: 20px;
}

h2 {
  margin-bottom: 20px;
  color: #333;
}

.login-btn,
.logout-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.login-btn {
  background-color: #e2231a;
  color: white;
}

.logout-btn {
  background-color: #f0f0f0;
  color: #333;
}

.account-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-info {
  font-size: 14px;
}

.status-label {
  font-weight: bold;
  margin-right: 5px;
}
</style>

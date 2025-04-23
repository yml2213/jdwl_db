<template>
  <div class="account-manager">
    <div v-if="!isLoggedIn" class="login-section">
      <button @click="openLoginWindow" class="login-btn">账号登录</button>
    </div>
    <div v-else class="user-info">
      <span class="user-text">当前账号：{{ username }}</span>
      <button @click="logout" class="logout-btn">退出登录</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  isLoggedIn as checkLogin,
  logout as clearLogin,
  getAllCookies
} from '../utils/cookieHelper'

// 登录状态
const isLoggedIn = ref(false)
// 用户名
const username = ref('')

// 从cookie中获取用户名 (从pin获取)
const updateUsername = async () => {
  const cookies = await getAllCookies()
  if (cookies && Array.isArray(cookies)) {
    const pinCookie = cookies.find((c) => c.name === 'pin')
    if (pinCookie && pinCookie.value) {
      try {
        // pin是URL编码的用户名
        username.value = decodeURIComponent(pinCookie.value)
      } catch (error) {
        console.error('解码用户名失败:', error)
        username.value = '京东用户'
      }
    } else {
      username.value = '京东用户'
    }
  }
}

// 打开登录窗口
const openLoginWindow = () => {
  window.api.openLoginWindow()
}

// 退出登录
const logout = () => {
  clearLogin()
  isLoggedIn.value = false
  username.value = ''
}

// 更新登录状态
const updateLoginStatus = async () => {
  isLoggedIn.value = await checkLogin()
  if (isLoggedIn.value) {
    updateUsername()
  }
}

// 事件监听器
const setupEventListeners = () => {
  // 登录成功后更新状态
  window.electron.ipcRenderer.on('login-successful', () => {
    updateLoginStatus()
  })
  // 清除cookies后更新状态
  window.electron.ipcRenderer.on('cookies-cleared', () => {
    isLoggedIn.value = false
    username.value = ''
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
  display: flex;
  align-items: center;
  height: 100%;
}

.login-section,
.user-info {
  display: flex;
  align-items: center;
}

.user-info {
  gap: 15px;
}

.user-text {
  color: white;
  font-size: 14px;
}

.login-btn,
.logout-btn {
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 16px;
  transition: background-color 0.2s;
}

.login-btn {
  background-color: white;
  color: #2196f3;
}

.login-btn:hover {
  background-color: #f0f0f0;
}

.logout-btn {
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.logout-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>

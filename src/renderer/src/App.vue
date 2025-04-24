<script setup>
import { ref, onMounted } from 'vue'
import AccountManager from './components/AccountManager.vue'
import { isLoggedIn } from './utils/cookieHelper'
import { clearSelections } from './utils/storageHelper'

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
        <h1 class="app-title">订单下载系统</h1>
        <div class="nav-links">
          <a href="#" class="nav-link active">首页</a>
          <a href="#" class="nav-link">功能测试</a>
        </div>
      </div>

      <div class="header-right">
        <AccountManager />
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="main-content">
      <div class="tabs">
        <div class="tab active">入仓打标</div>
        <div class="tab">清库下标</div>
        <div class="tab">退货入库</div>
      </div>

      <div class="content-area">
        <!-- 登录提示 -->
        <div v-if="!isUserLoggedIn" class="login-prompt">
          <p>请先登录京东账号</p>
        </div>

        <!-- 首页内容 - 目前为空 -->
        <div v-else class="empty-content">
          <p>欢迎使用订单下载系统</p>
          <p class="sub-text">更多功能正在开发中...</p>
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
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
    'Helvetica Neue', sans-serif;
  background-color: #f5f5f5;
  color: #333;
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
  padding: 20px;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 20px;
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
}

/* 新增样式 */
.content-area {
  display: flex;
  flex-direction: column;
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

.empty-content {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 50px;
  text-align: center;
  max-width: 800px;
  margin: 50px auto;
}

.empty-content p {
  color: #333;
  font-size: 18px;
  margin-bottom: 10px;
}

.empty-content .sub-text {
  color: #999;
  font-size: 14px;
}
</style>

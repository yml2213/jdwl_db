<script setup>
import Versions from './components/Versions.vue'
import AccountManager from './components/AccountManager.vue'
import { onMounted } from 'vue'

const ipcHandle = () => window.electron.ipcRenderer.send('ping')

// 监听登录成功事件
onMounted(() => {
  window.electron.ipcRenderer.on('login-successful', () => {
    alert('登录成功！')
  })

  window.electron.ipcRenderer.on('cookies-cleared', () => {
    alert('已退出登录')
  })
})
</script>

<template>
  <div class="container">
    <div class="header">
      <img alt="logo" class="logo" src="./assets/electron.svg" />
      <div class="creator">Powered by electron-vite</div>
    </div>

    <div class="content">
      <div class="text">
        Build an Electron app with
        <span class="vue">Vue</span>
      </div>
      <p class="tip">Please try pressing <code>F12</code> to open the devTool</p>

      <!-- 账号管理组件 -->
      <AccountManager />

      <div class="actions">
        <div class="action">
          <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">Documentation</a>
        </div>
        <div class="action">
          <a target="_blank" rel="noreferrer" @click="ipcHandle">Send IPC</a>
        </div>
      </div>
      <Versions />
    </div>
  </div>
</template>

<style>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px;
}

.header {
  margin-bottom: 30px;
}

.logo {
  width: 80px;
  margin-bottom: 10px;
}

.creator {
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
}

.content {
  max-width: 600px;
  width: 100%;
}

.text {
  font-size: 20px;
  margin-bottom: 24px;
}

.vue {
  color: #42b883;
  font-weight: bold;
}

.tip {
  margin: 20px 0;
  color: #666;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 30px 0;
}

.action a {
  display: inline-block;
  padding: 10px 20px;
  border-radius: 4px;
  background-color: #f0f0f0;
  color: #333;
  text-decoration: none;
  transition: background-color 0.2s;
}

.action a:hover {
  background-color: #e0e0e0;
}
</style>

<script setup>
import { ref, onMounted } from 'vue'
import AccountManager from './components/AccountManager.vue'
import VendorSelector from './components/VendorSelector.vue'
import DepartmentSelector from './components/DepartmentSelector.vue'

// 选择的供应商
const selectedVendor = ref('')
// 选择的事业部
const selectedDepartment = ref(null)

// 处理供应商选择
const handleVendorSelected = (vendor) => {
  console.log('选择的供应商:', vendor)
  selectedVendor.value = vendor.name
  selectedDepartment.value = null
}

// 处理事业部选择
const handleDepartmentSelected = (department) => {
  selectedDepartment.value = department
}

// 监听登录成功事件
onMounted(() => {
  window.electron.ipcRenderer.on('login-successful', () => {
    alert('登录成功！')
  })

  window.electron.ipcRenderer.on('cookies-cleared', () => {
    alert('已退出登录')
    // 清空选择的供应商和事业部
    selectedVendor.value = ''
    selectedDepartment.value = null
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
        <!-- 数据选择区域 -->
        <div class="selectors-container">
          <VendorSelector @vendor-selected="handleVendorSelected" />
          <DepartmentSelector
            :vendor-name="selectedVendor"
            @department-selected="handleDepartmentSelected"
          />

          <!-- 选择结果展示 -->
          <div v-if="selectedDepartment" class="selection-summary">
            <h3>当前选择</h3>
            <p>
              供应商: <strong>{{ selectedVendor }}</strong>
            </p>
            <p>
              事业部: <strong>{{ selectedDepartment.name }}</strong>
            </p>
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

.selectors-container {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.selection-summary {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-top: 20px;
}

.selection-summary h3 {
  font-size: 16px;
  margin-bottom: 15px;
  color: #333;
  font-weight: 500;
}

.selection-summary p {
  margin-bottom: 10px;
  color: #666;
}

.selection-summary strong {
  color: #2196f3;
}
</style>

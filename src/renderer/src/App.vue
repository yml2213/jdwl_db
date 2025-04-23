<script setup>
import { ref, onMounted, computed } from 'vue'
import AccountManager from './components/AccountManager.vue'
import VendorSelector from './components/VendorSelector.vue'
import DepartmentSelector from './components/DepartmentSelector.vue'
import { isLoggedIn } from './utils/cookieHelper'
import {
  saveSelectedVendor,
  saveSelectedDepartment,
  getSelectedVendor,
  getSelectedDepartment,
  hasUserSelected,
  markAsSelected,
  clearSelections
} from './utils/storageHelper'

// 选择的供应商
const selectedVendor = ref('')
// 选择的事业部
const selectedDepartment = ref(null)
// 用户是否已选择（一旦选择就不能再更改）
const hasSelected = ref(false)
// 用户是否已登录
const isUserLoggedIn = ref(false)

// 计算属性：是否显示选择器
const showSelectors = computed(() => {
  return isUserLoggedIn.value && !hasSelected.value
})

// 计算属性：是否显示已选择信息
const showSelectionSummary = computed(() => {
  return (
    isUserLoggedIn.value && hasSelected.value && selectedVendor.value && selectedDepartment.value
  )
})

// 处理供应商选择
const handleVendorSelected = (vendor) => {
  console.log('选择的供应商:', vendor)
  // 保存完整的供应商对象
  const vendorData = {
    id: vendor.id,
    name: vendor.name,
    supplierNo: vendor.id
  }
  selectedVendor.value = vendor.name
  saveSelectedVendor(vendorData)
  selectedDepartment.value = null
}

// 处理事业部选择
const handleDepartmentSelected = (department) => {
  console.log('选择的事业部:', department)
  selectedDepartment.value = department
  saveSelectedDepartment(department)

  // 标记用户已经完成选择
  hasSelected.value = true
  markAsSelected()
}

// 加载保存的选择
const loadSavedSelections = () => {
  const savedVendor = getSelectedVendor()
  const savedDepartment = getSelectedDepartment()
  const userHasSelected = hasUserSelected()

  console.log('加载保存的选择:', { savedVendor, savedDepartment, userHasSelected })

  if (savedVendor) {
    selectedVendor.value = savedVendor.name
  }

  if (savedDepartment) {
    selectedDepartment.value = savedDepartment
  }

  hasSelected.value = userHasSelected
}

// 检查登录状态并加载选择
const checkLoginAndLoadSelections = async () => {
  const loggedIn = await isLoggedIn()
  isUserLoggedIn.value = loggedIn

  if (loggedIn) {
    loadSavedSelections()
  } else {
    // 未登录则清除所有选择
    selectedVendor.value = ''
    selectedDepartment.value = null
    hasSelected.value = false
    clearSelections()
  }
}

// 处理退出登录
const handleLogout = () => {
  isUserLoggedIn.value = false
  selectedVendor.value = ''
  selectedDepartment.value = null
  hasSelected.value = false
  clearSelections()
}

// 组件挂载时检查登录状态并加载选择
onMounted(() => {
  checkLoginAndLoadSelections()

  // 监听登录成功事件
  window.electron.ipcRenderer.on('login-successful', () => {
    alert('登录成功！')
    checkLoginAndLoadSelections()
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

        <!-- 数据选择区域 - 仅在登录后且尚未选择时显示 -->
        <div v-if="showSelectors" class="selectors-container">
          <div class="selection-header">
            <h3>请选择供应商和事业部（只能选择一次）</h3>
          </div>
          <VendorSelector @vendor-selected="handleVendorSelected" />
          <DepartmentSelector
            :vendor-name="selectedVendor"
            @department-selected="handleDepartmentSelected"
          />
        </div>

        <!-- 选择结果展示 -->
        <div v-if="showSelectionSummary" class="selection-summary">
          <h3>当前使用的数据</h3>
          <p>
            供应商: <strong>{{ selectedVendor }}</strong>
          </p>
          <p>
            事业部: <strong>{{ selectedDepartment.name }}</strong>
          </p>
          <p>
            供应商编号: <strong>{{ getSelectedVendor()?.supplierNo }}</strong>
          </p>
          <p>
            事业部编号: <strong>{{ selectedDepartment.deptNo }}</strong>
          </p>
          <div class="info-note">
            <p>注意：数据已保存，再次登录时将自动使用。如需更改，请联系管理员。</p>
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

.selection-header {
  background-color: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  border-left: 4px solid #2196f3;
}

.selection-header h3 {
  color: #333;
  font-size: 16px;
  font-weight: 500;
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

.selection-summary {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin: 20px auto;
  max-width: 800px;
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

.info-note {
  margin-top: 20px;
  padding: 10px;
  background-color: #e8f5e9;
  border-radius: 4px;
  border-left: 4px solid #4caf50;
}

.info-note p {
  color: #2e7d32;
  font-size: 14px;
}
</style>

<template>
  <div class="account-manager">
    <div v-if="!isLoggedIn" class="login-section">
      <button @click="openLoginWindow" class="login-btn">账号登录</button>
    </div>
    <div v-else class="user-info">
      <span class="user-text">当前账号：{{ username }}</span>
      <div class="dropdown">
        <button class="user-btn">账号管理</button>
        <div class="dropdown-content">
          <div class="user-details">
            <h3>账号信息</h3>
            <div v-if="hasSelectedData" class="selected-data">
              <h4>当前使用的数据</h4>
              <p>
                供应商: <strong>{{ selectedVendor?.name }}</strong>
              </p>
              <p>
                供应商编号: <strong>{{ selectedVendor?.supplierNo }}</strong>
              </p>
              <p>
                事业部: <strong>{{ selectedDepartment?.name }}</strong>
              </p>
              <p>
                事业部编号: <strong>{{ selectedDepartment?.deptNo }}</strong>
              </p>
              <div class="info-note">
                <p>注意：数据已保存，再次登录时将自动使用。如需更改，请联系管理员。</p>
              </div>
            </div>
            <div v-else-if="!hasSelected" class="no-data">
              <p>尚未选择供应商和事业部</p>
              <button @click="startSelection" class="select-btn">选择供应商和事业部</button>
            </div>
            <div class="logout-section">
              <button @click="logout" class="logout-btn">退出登录</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 选择供应商和事业部的弹窗 -->
    <div v-if="showSelectionModal" class="selection-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>选择供应商和事业部（只能选择一次）</h3>
          <button @click="closeSelectionModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <VendorSelector @vendor-selected="handleVendorSelected" />
          <DepartmentSelector
            :vendor-name="tempVendorName"
            @department-selected="handleDepartmentSelected"
          />
        </div>
        <div class="modal-footer">
          <p>请注意：选择后将无法再次更改</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  isLoggedIn as checkLogin,
  logout as clearLogin,
  getAllCookies
} from '../utils/cookieHelper'
import {
  saveSelectedVendor,
  saveSelectedDepartment,
  getSelectedVendor,
  getSelectedDepartment,
  hasUserSelected,
  markAsSelected
} from '../utils/storageHelper'
import VendorSelector from './VendorSelector.vue'
import DepartmentSelector from './DepartmentSelector.vue'

// 登录状态
const isLoggedIn = ref(false)
// 用户名
const username = ref('')
// 选择弹窗显示状态
const showSelectionModal = ref(false)
// 临时存储选择的供应商名称
const tempVendorName = ref('')
// 是否已经选择
const hasSelected = ref(false)

// 获取已保存的供应商和事业部数据
const selectedVendor = ref(null)
const selectedDepartment = ref(null)

// 是否有选择数据
const hasSelectedData = computed(() => {
  return selectedVendor.value && selectedDepartment.value
})

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
  selectedVendor.value = null
  selectedDepartment.value = null
  hasSelected.value = false
}

// 更新登录状态
const updateLoginStatus = async () => {
  isLoggedIn.value = await checkLogin()
  if (isLoggedIn.value) {
    updateUsername()
    loadSavedSelections()
    
    // 如果登录成功但尚未选择供应商和事业部，自动显示选择弹窗
    if (!hasSelected.value) {
      showSelectionModal.value = true
    }
  }
}

// 加载保存的选择
const loadSavedSelections = () => {
  selectedVendor.value = getSelectedVendor()
  selectedDepartment.value = getSelectedDepartment()
  hasSelected.value = hasUserSelected()
}

// 开始选择
const startSelection = () => {
  showSelectionModal.value = true
}

// 关闭选择弹窗
const closeSelectionModal = () => {
  showSelectionModal.value = false
  tempVendorName.value = ''
}

// 处理供应商选择
const handleVendorSelected = (vendor) => {
  console.log('选择的供应商:', vendor)
  // 暂存供应商名称，用于传递给事业部选择器
  tempVendorName.value = vendor.name

  // 保存完整的供应商对象
  const vendorData = {
    id: vendor.id,
    name: vendor.name,
    supplierNo: vendor.id
  }
  saveSelectedVendor(vendorData)
}

// 处理事业部选择
const handleDepartmentSelected = (department) => {
  console.log('选择的事业部:', department)
  console.log('事业部 sellerId:', department.sellerId)
  saveSelectedDepartment(department)

  // 更新界面显示
  selectedVendor.value = getSelectedVendor()
  selectedDepartment.value = getSelectedDepartment()

  // 标记用户已经完成选择
  hasSelected.value = true
  markAsSelected()

  // 关闭选择弹窗
  closeSelectionModal()
  
  // 刷新整个页面，确保数据正确加载
  window.location.reload()
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
    selectedVendor.value = null
    selectedDepartment.value = null
    hasSelected.value = false
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
.logout-btn,
.user-btn,
.select-btn {
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

.user-btn {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.user-btn:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

.logout-btn {
  background-color: #f44336;
  color: white;
  margin-top: 15px;
}

.logout-btn:hover {
  background-color: #e53935;
}

.select-btn {
  background-color: #2196f3;
  color: white;
  margin-top: 10px;
}

.select-btn:hover {
  background-color: #1e88e5;
}

/* 下拉菜单 */
.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-content {
  display: none;
  position: absolute;
  right: 0;
  background-color: #f9f9f9;
  min-width: 300px;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
  z-index: 1;
  border-radius: 4px;
  overflow: hidden;
}

.dropdown:hover .dropdown-content {
  display: block;
}

.user-details {
  padding: 15px;
}

.user-details h3 {
  color: #333;
  font-size: 16px;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.user-details h4 {
  color: #555;
  font-size: 14px;
  margin: 10px 0;
}

.user-details p {
  margin: 8px 0;
  font-size: 14px;
  color: #666;
}

.user-details strong {
  color: #2196f3;
}

.logout-section {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.no-data {
  padding: 10px 0;
  text-align: center;
  color: #666;
}

.info-note {
  margin-top: 15px;
  padding: 10px;
  background-color: #e8f5e9;
  border-radius: 4px;
  border-left: 4px solid #4caf50;
}

.info-note p {
  color: #2e7d32;
  font-size: 13px;
  margin: 0;
}

/* 弹窗样式 */
.selection-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.modal-header {
  padding: 15px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 15px;
  border-top: 1px solid #eee;
  text-align: center;
  background-color: #f5f5f5;
}

.modal-footer p {
  margin: 0;
  color: #e53935;
  font-size: 14px;
  font-weight: 500;
}
</style>

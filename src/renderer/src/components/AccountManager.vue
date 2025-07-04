<template>
  <div class="account-manager" :class="`display-mode-${displayMode}`">
    <div v-if="!isLoggedIn" class="login-section">
      <button @click="openLoginWindow" class="login-btn">
        <span class="icon">🔑</span>
        账号登录
        <span class="arrow-icon" v-if="displayMode === 'central'">→</span>
      </button>
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
import { ref, onMounted, onUnmounted, computed, inject } from 'vue'
import { getAllCookies } from '../utils/cookieHelper'
import { createSession } from '../services/apiService'
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

defineProps({
  displayMode: {
    type: String,
    default: 'header', // 'header' or 'central'
    validator: (value) => ['header', 'central'].includes(value)
  }
})

const emit = defineEmits(['login-success', 'logout'])
const sessionContext = inject('sessionContext')
const isLoggedIn = computed(() => !!sessionContext.value)
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
const logout = async () => {
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('logout')
  }

  // 触发logout事件，通知App.vue更新状态
  emit('logout')
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

  // 保存完整的供应商对象，确保包含正确的id属性
  const vendorData = {
    id: vendor.id,
    name: vendor.name,
    supplierNo: vendor.id // 保持supplierNo兼容性
  }
  saveSelectedVendor(vendorData)
}

// 处理事业部选择
const handleDepartmentSelected = async (department) => {
  console.log('选择的事业部:', department)
  saveSelectedDepartment(department)

  // 更新界面显示
  const vendorInfo = getSelectedVendor()
  const departmentInfo = getSelectedDepartment()
  selectedVendor.value = vendorInfo
  selectedDepartment.value = departmentInfo

  // 标记用户已经完成选择
  hasSelected.value = true
  markAsSelected()

  // 关键改动：创建后端会话
  try {
    const cookies = await getAllCookies()
    const pinCookie = cookies?.find((c) => c.name === 'pin')

    if (!pinCookie) {
      alert('创建会话失败：无法找到关键的用户凭据(pin)，请尝试重新登录。')
      return
    }

    if (!cookies || !vendorInfo || !departmentInfo) {
      alert('创建会话失败：缺少Cookies、供应商或事业部信息。')
      return
    }

    const sessionData = {
      uniqueKey: `${pinCookie.value}-${departmentInfo.id}`, // 使用 pin + 事业部ID 作为唯一标识
      cookies,
      supplierInfo: vendorInfo,
      departmentInfo
    }
    const response = await createSession(sessionData)

    if (response) {
      alert('供应商和事业部选择成功，后端会话已创建！')
      // 关键改动：发出登录成功事件
      emit('login-success')
    } else {
      throw new Error('创建后端会话失败，未收到有效响应。')
    }
  } catch (error) {
    console.error('创建后端会话失败:', error)
    alert(`创建后端会话失败: ${error.message}`)
  }

  // 关闭选择弹窗
  closeSelectionModal()
}

const handleLoginSuccess = async () => {
  console.log('登录成功事件被触发！')
  await updateUsername() // 更新用户名
  loadSavedSelections() // 加载已保存的选择
  console.log('登录成功后，用户名更新为:', username.value)
  console.log('本地存储中是否有已选择的供应商和事业部:', hasUserSelected())

  // 如果用户已经选择过供应商和事业部
  if (hasUserSelected()) {
    console.log('用户已选择供应商和事业部，尝试直接创建会话。')
    try {
      // 获取所有必要数据
      const cookies = await getAllCookies()
      console.log('获取到cookie数量:', cookies?.length || 0)

      // 检查cookies是否有效
      if (!cookies || cookies.length === 0) {
        console.error('未获取到有效的cookies，无法创建会话')
        throw new Error('未获取到有效的cookies，请尝试重新登录')
      }

      // 检查必要的cookie是否存在
      const requiredCookieNames = ['pin', 'thor', 'csrfToken']
      const missingCookies = requiredCookieNames.filter(
        (name) => !cookies.some((cookie) => cookie.name === name)
      )

      if (missingCookies.length > 0) {
        console.error('缺少必要的cookie:', missingCookies.join(', '))
        throw new Error(`缺少必要的cookie: ${missingCookies.join(', ')}，请重新登录`)
      }

      const vendorInfo = getSelectedVendor()
      console.log('本地保存的供应商信息:', vendorInfo?.name || '无')

      const departmentInfo = getSelectedDepartment()
      console.log('本地保存的事业部信息:', departmentInfo?.name || '无')

      const pinCookie = cookies?.find((c) => c.name === 'pin')
      console.log('找到pin cookie:', pinCookie?.value || '未找到')

      if (!pinCookie || !cookies || !vendorInfo || !departmentInfo) {
        console.error(
          '缺少会话创建所需的关键数据:',
          !pinCookie ? 'pin cookie缺失' : '',
          !cookies ? 'cookies缺失' : '',
          !vendorInfo ? '供应商信息缺失' : '',
          !departmentInfo ? '事业部信息缺失' : ''
        )
        throw new Error('无法从本地存储恢复关键信息，请重新登录并选择。')
      }

      const sessionData = {
        uniqueKey: `${pinCookie.value}-${departmentInfo.id}`,
        cookies,
        supplierInfo: vendorInfo,
        departmentInfo
      }
      console.log('准备创建后端会话，唯一标识:', sessionData.uniqueKey)
      console.log('会话数据包含cookies数量:', cookies.length)
      console.log('会话数据包含供应商:', vendorInfo.name)
      console.log('会话数据包含事业部:', departmentInfo.name)

      // Re-create session on the backend
      console.log('正在创建后端会话...')
      const response = await createSession(sessionData)
      console.log('后端会话创建响应:', response ? '成功' : '失败')

      if (response) {
        console.log('登录后自动创建会话成功！')
        // 关键改动：发出登录成功事件
        emit('login-success')

        // 添加延迟刷新页面机制，确保UI状态更新
        console.log('设置一个延时，如果3秒内UI没有切换，将强制刷新页面...')
        const refreshTimeout = setTimeout(() => {
          console.log('检测到可能的UI更新问题，正在尝试强制刷新页面...')
          window.location.reload()
        }, 3000)

        // 创建一个MutationObserver来监控DOM变化
        // 如果检测到UI已经切换到主界面，则取消刷新
        const observer = new MutationObserver((mutations) => {
          // 检查是否已经显示了主界面的某些元素
          if (
            document.querySelector('.main-body') &&
            document.querySelector('.tabs') &&
            !document.querySelector('.login-prompt')
          ) {
            console.log('已检测到UI成功切换到主界面，取消刷新计时器')
            clearTimeout(refreshTimeout)
            observer.disconnect()
          }
        })

        // 开始观察文档变化
        observer.observe(document.body, {
          childList: true,
          subtree: true
        })
      } else {
        throw new Error('后端会话重建失败，服务器没有返回有效响应。')
      }
    } catch (error) {
      console.error('自动创建会话失败:', error)

      // 提供更详细的错误信息
      let errorMessage = error.message || '未知错误'
      if (errorMessage.includes('Network Error')) {
        errorMessage = '网络连接失败，请检查网络连接并重试'
      } else if (errorMessage.includes('timeout')) {
        errorMessage = '请求超时，服务器响应时间过长'
      }

      alert(`自动恢复会话失败: ${errorMessage}\n\n请尝试重新登录或刷新页面。`)

      // Fallback to showing selection modal if session creation fails
      showSelectionModal.value = true
    }
  } else {
    // If user has not selected vendor/department, show the modal.
    console.log('用户尚未选择供应商和事业部，显示选择弹窗。')
    showSelectionModal.value = true
  }
}

onMounted(() => {
  // This is for when the app is opened and user is already logged in.
  loadSavedSelections()
  if (isLoggedIn.value) {
    updateUsername()
  }

  // Listen for the login-successful event from the main process
  window.electron.ipcRenderer.on('login-successful', handleLoginSuccess)
})

onUnmounted(() => {
  // Clean up the listener when the component is unmounted
  window.electron.ipcRenderer.removeAllListeners('login-successful')
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
  width: 100%;
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
  display: flex;
  align-items: center;
  justify-content: center;
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
  min-width: 700px;
  max-width: 900px;
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

/* Central display mode styles */
.display-mode-central .login-btn {
  padding: 15px 30px;
  font-size: 1.2rem;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #4b91f7 0%, #367af6 100%);
  box-shadow: 0 8px 15px rgba(54, 122, 246, 0.3);
  transition: all 0.3s ease;
  border: none;
  letter-spacing: 1px;
  width: 100%;
  color: #fff;
}

.display-mode-central .login-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 20px rgba(54, 122, 246, 0.4);
  background: linear-gradient(135deg, #5a9cf8 0%, #478af6 100%);
}

.display-mode-central .icon {
  font-size: 1.3rem;
}

.display-mode-central .arrow-icon {
  margin-left: 10px;
  font-size: 1.3rem;
  transition: transform 0.3s ease;
}

.display-mode-central .login-btn:hover .arrow-icon {
  transform: translateX(5px);
}
</style>

<template>
  <div class="account-manager" :class="`display-mode-${displayMode}`">
    <div v-if="!isLoggedIn" class="login-section">
      <button class="login-btn" @click="openLoginWindow">
        <span class="icon">🔑</span>
        账号登录
        <span v-if="displayMode === 'central'" class="arrow-icon">→</span>
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
              <button class="select-btn" @click="startSelection">选择供应商和事业部</button>
            </div>
            <div class="logout-section">
              <button class="logout-btn" @click="logout">退出登录</button>
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
          <button class="close-btn" @click="closeSelectionModal">&times;</button>
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
import {
  createSession,
  updateSelection,
  logout as logoutApi,
  checkSubscriptionStatus
} from '../services/apiService'
import {
  saveSelectedVendor,
  saveSelectedDepartment,
  getSelectedVendor,
  getSelectedDepartment,
  hasUserSelected,
  markAsSelected,
  clearSelections
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

// 登录状态
const isLoggedIn = computed(() => sessionContext.value && sessionContext.value.user)

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
const updateUsername = async (passedCookies) => {
  // 优先使用传入的 cookies，如果没有，再从存储中获取
  const cookies = passedCookies || (await getAllCookies())
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

// 执行订阅检查和卡密验证
const performSubscriptionCheck = async (vendorInfo, departmentInfo) => {
  try {
    // 获取当前用户名和部门ID来生成正确的 uniqueKey
    const cookies = await getAllCookies()
    const pinCookie = cookies?.find((c) => c.name === 'pin')
    if (!pinCookie?.value || !departmentInfo.deptNo) {
      throw new Error('无法获取用户信息或部门信息')
    }

    const username = decodeURIComponent(pinCookie.value)
    const deptId = departmentInfo.deptNo.replace('CBU', '')
    const uniqueKey = `${username}-${deptId}`

    console.log(`开始验证订阅状态，uniqueKey: ${uniqueKey}`)

    // 首先调用订阅状态检查接口
    const subscriptionResult = await checkSubscriptionStatus(uniqueKey)

    if (subscriptionResult.success && subscriptionResult.data.currentStatus.isValid) {
      // 订阅有效
      console.log('订阅验证成功，用户可以正常使用功能')
      const validUntil = subscriptionResult.data.validUntilFormatted
      showNotification(
        '订阅验证成功',
        `您的订阅有效，可以正常使用所有功能。有效期至：${validUntil}`,
        'success'
      )
    } else {
      // 订阅无效或不存在，引导用户订阅
      console.log('订阅无效或不存在，将引导用户订阅')
      const message = subscriptionResult.data?.currentStatus?.message || '未找到有效订阅'

      // 显示订阅状态信息
      showNotification('需要订阅', `${message}，即将为您打开订阅页面`, 'info')

      // 调用主进程打开购买页面
      const authResult = await window.electron.ipcRenderer.invoke('check-auth-status', {
        uniqueKey
      })
      // 这里 authResult.success 会是 false，主进程会自动打开购买页面
    }
  } catch (error) {
    console.error('订阅检查失败:', error)

    // 如果是网络错误或支付服务不可用，仍然尝试通过主进程验证
    if (error.message.includes('fetch') || error.message.includes('HTTP')) {
      console.log('支付服务不可用，尝试通过本地卡密验证')
      showNotification('支付服务连接失败', '将尝试通过本地卡密进行验证', 'warning')

      try {
        const authResult = await window.electron.ipcRenderer.invoke('check-auth-status', {
          uniqueKey
        })
        if (authResult.success) {
          showNotification('本地验证成功', '您可以正常使用功能', 'success')
        }
      } catch (localError) {
        console.error('本地验证也失败:', localError)
        showNotification('验证失败', '无法验证您的订阅状态，请检查网络连接', 'error')
      }
    } else {
      showNotification('订阅检查失败', `验证过程中出现错误: ${error.message}`, 'error')
    }
  }
}

// 显示通知的辅助函数
const showNotification = (title, message, type = 'info') => {
  // 这里可以使用 Element Plus 的通知组件或者简单的 alert
  if (type === 'success') {
    console.log(`✅ ${title}: ${message}`)
  } else if (type === 'error') {
    console.error(`❌ ${title}: ${message}`)
    alert(`${title}: ${message}`)
  } else {
    console.log(`ℹ️ ${title}: ${message}`)
  }
}

// 打开登录窗口
const openLoginWindow = () => {
  window.api.openLoginWindow()
}

// 退出登录
const logout = async () => {
  try {
    // 1. 先调用后端登出接口，清除后端会话
    console.log('【调试】调用后端登出接口')
    await logoutApi()
    console.log('【调试】后端会话已清除')
  } catch (error) {
    console.error('【调试】后端登出失败:', error)
    // 即使后端登出失败，也继续执行前端登出流程
  }

  // 2. 清除前端存储
  console.log('【调试】清除前端存储')
  localStorage.clear()
  sessionStorage.clear()

  // 3. 触发登出事件，通知 App.vue 更新状态
  // App.vue 会负责调用 window.api.clearCookies() 和重连 WebSocket
  console.log('【调试】触发 logout 事件')
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

  // 关键改动：将选择结果更新到后端
  try {
    const selectionData = {
      supplierInfo: vendorInfo,
      departmentInfo: departmentInfo
    }
    const response = await updateSelection(selectionData)
    if (!response.success) {
      throw new Error(response.message || '更新后端选择失败')
    }

    console.log('选择已成功更新到后端。开始进行卡密验证...')

    // 立即进行卡密验证
    await performSubscriptionCheck(vendorInfo, departmentInfo)

    // 使用后端返回的最新、最完整的上下文来完成登录流程
    emit('login-success', response.context)
  } catch (error) {
    console.error('更新后端选择失败:', error)
    alert(`关键步骤失败：无法保存您的选择。错误: ${error.message}`)
    // 可选：执行登出逻辑
    logout()
  }

  // 关闭选择弹窗
  closeSelectionModal()
}

const handleLoginSuccess = async (allCookies) => {
  console.log('步骤1: JD登录成功，开始创建后端会话。')

  if (!allCookies || !Array.isArray(allCookies) || allCookies.length === 0) {
    console.error('登录失败: 接收到的 cookies 无效', allCookies)
    alert('登录失败: 无法获取有效的登录凭据')
    return
  }

  await updateUsername(allCookies)
  clearSelections()

  try {
    // 步骤1.1: 筛选出必要的Cookie
    const requiredCookieNames = ['pin', 'thor', 'csrfToken', 'flash']
    const essentialCookies = allCookies.filter((c) => requiredCookieNames.includes(c.name))

    if (essentialCookies.length < requiredCookieNames.length) {
      const missing = requiredCookieNames.filter((n) => !essentialCookies.some((c) => c.name === n))
      throw new Error(`登录凭据不完整，缺少以下Cookie: ${missing.join(', ')}`)
    }

    // 步骤1.2: 调用后端创建会话
    let response
    let retries = 3

    while (retries > 0) {
      try {
        response = await createSession(essentialCookies)
        if (response.success) {
          break
        } else {
          throw new Error(response.message || '创建后端会话失败')
        }
      } catch (error) {
        retries--
        if (retries === 0) {
          throw error
        }
        console.warn(`创建会话失败，剩余重试次数: ${retries}`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    console.log('步骤2: 后端会话已成功创建，准备选择供应商/事业部。')
    // 更新本地的会话上下文，以便后续API调用（如getVendorList）能使用
    sessionContext.value = response.context

    // 步骤3: 打开选择弹窗
    startSelection()
  } catch (error) {
    console.error('登录流程失败 (步骤1/2):', error)
    alert(`登录流程中断: ${error.message}`)
    logout()
  }
}

const initialize = async () => {
  // This is for when the app is opened and user is already logged in.
  loadSavedSelections()
  if (isLoggedIn.value) {
    await updateUsername() // 这里不需要传cookies，它会自己去获取
  }
}

// 在所有函数声明后暴露方法
defineExpose({
  handleLoginSuccess
})

onMounted(() => {
  initialize()
})

onUnmounted(() => {
  // Clean up the listener when the component is unmounted
  // window.electron.ipcRenderer.removeAllListeners('login-successful')
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

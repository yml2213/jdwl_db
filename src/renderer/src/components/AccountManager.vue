<template>
  <div class="account-manager-container">
    <!-- Step 1: Login Button -->
    <div v-if="loginStep === 'initial' && !isLoggedIn" class="login-section">
      <div class="login-card">
        <h2>京东仓储一体化工具</h2>
        <p class="tagline">高效、智能、一体化的仓储管理解决方案</p>
        <button class="login-btn central-login-btn" @click="openLoginWindow">
          <span class="icon">🔑</span>
          使用京东账号登录
        </button>
        <p class="login-note">
          点击登录将打开京东官方登录页面，我们不会保存您的任何密码信息。
        </p>
      </div>
    </div>

    <!-- Step 2: Loading data after login -->
    <div v-else-if="loginStep === 'loading'" class="loading-section">
      <div class="spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>

    <!-- Step 3: Department Selection -->
    <div v-else-if="loginStep === 'selecting'" class="selection-section">
      <div class="selection-content">
        <h3>请选择您的事业部</h3>
        <p>此选择仅需进行一次，后续登录将自动应用。</p>
        <DepartmentSelector @department-selected="handleDepartmentSelected" />
        <div v-if="selectionError" class="error-message">{{ selectionError }}</div>
      </div>
    </div>

    <!-- Logged In State (Header) -->
    <div v-if="isLoggedIn" class="user-info-header">
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
            <div class="logout-section">
              <button class="logout-btn" @click="logout">退出登录</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, inject, watch } from 'vue'
import { useSubscription } from '../composables/useSubscription'
import { getAllCookies } from '../utils/cookieHelper'
import {
  createSession,
  updateSelection,
  checkSubscriptionStatus,
  getVendorList
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
import DepartmentSelector from './DepartmentSelector.vue'

const emit = defineEmits(['login-success', 'logout'])
const sessionContext = inject('sessionContext')
const {
  subscriptionInfo,
  subscriptionLoading,
  loadSubscriptionInfo,
  renewSubscription,
  startPolling,
  stopPolling
} = useSubscription(sessionContext)

// --- State Management for Login Flow ---
const loginStep = ref('initial') // 'initial', 'loading', 'selecting'
const loadingMessage = ref('正在验证登录...')
const selectionError = ref('')

// --- Component State ---
const isLoggedIn = computed(() => sessionContext.value && sessionContext.value.user && hasSelected.value)
const username = ref('')
const allVendors = ref([])
const hasSelected = ref(false)
const selectedVendor = ref(null)
const selectedDepartment = ref(null)
const hasSelectedData = computed(() => selectedVendor.value && selectedDepartment.value)

// --- Methods ---

const updateUsername = async (passedCookies) => {
  const cookies = passedCookies || (await getAllCookies())
  if (cookies && Array.isArray(cookies)) {
    const pinCookie = cookies.find((c) => c.name === 'pin')
    username.value = pinCookie ? decodeURIComponent(pinCookie.value) : '京东用户'
  }
}

const openLoginWindow = () => {
  window.api.openLoginWindow()
}

const logout = () => {
  emit('logout')
}

const handleLoginSuccess = async (allCookies) => {
  console.log('步骤1: JD登录成功，开始处理会话和数据。')
  loginStep.value = 'loading'
  loadingMessage.value = '登录成功，正在获取用户信息...'

  if (!allCookies || !Array.isArray(allCookies) || allCookies.length === 0) {
    alert('登录失败: 无法获取有效的登录凭据')
    loginStep.value = 'initial'
    return
  }

  await updateUsername(allCookies)
  clearSelections()

  try {
    // Create backend session
    const requiredCookieNames = ['pin', 'thor', 'csrfToken', 'flash']
    const essentialCookies = allCookies.filter((c) => requiredCookieNames.includes(c.name))
    if (essentialCookies.length < requiredCookieNames.length) {
      throw new Error(`登录凭据不完整，缺少Cookie: ${requiredCookieNames.filter(n => !essentialCookies.some(c => c.name === n)).join(', ')}`)
    }
    
    loadingMessage.value = '正在创建后端会话...'
    const response = await createSession(essentialCookies)
    if (!response.success) throw new Error(response.message || '创建后端会话失败')
    sessionContext.value = response.context // Temporarily set context for API calls

    // Fetch vendor list
    loadingMessage.value = '正在获取供应商列表...'
    const vendors = await getVendorList()
    if (!vendors || vendors.length === 0) throw new Error('未能获取到供应商列表')
    allVendors.value = vendors

    // Move to selection step
    loginStep.value = 'selecting'
  } catch (error) {
    console.error('登录流程失败:', error)
    alert(`登录流程中断: ${error.message}`)
    loginStep.value = 'initial'
    // Optionally logout if session creation failed partially
    logout()
  }
}

watch(subscriptionInfo, (newInfo) => {
  if (newInfo?.success && newInfo?.data?.currentStatus?.isValid) {
    console.log('订阅状态更新，现在有效，将完成登录。')
    stopPolling() // 确保轮询已停止
    window.electron.ipcRenderer.send('subscription-successful')
    emit('login-success', newInfo.context || sessionContext.value)
  }
})

const performSubscriptionCheck = async () => {
  await loadSubscriptionInfo()
  if (subscriptionInfo.value?.success && subscriptionInfo.value?.data?.currentStatus?.isValid) {
    console.log('订阅验证成功')
    return true
  } else {
    const message = subscriptionInfo.value?.data?.currentStatus?.message || '未找到有效订阅'
    selectionError.value = `${message}，请订阅后重试。`
    renewSubscription() // This will open the renewal page and start polling
    return false
  }
}

const handleDepartmentSelected = async (department) => {
  loginStep.value = 'loading'
  loadingMessage.value = '正在为您配置事业部...'
  selectionError.value = ''

  try {
    const vendorNameToMatch = department.sellerName
    if (!vendorNameToMatch) throw new Error('选择的事业部信息不完整，缺少供应商名称。')

    const matchedVendor = allVendors.value.find(v => v.name === vendorNameToMatch)
    if (!matchedVendor) throw new Error(`未能在供应商列表中找到与“${vendorNameToMatch}”匹配的供应商。`)

    console.log('成功匹配供应商:', matchedVendor)
    saveSelectedDepartment(department)
    saveSelectedVendor(matchedVendor)
    selectedVendor.value = matchedVendor
    selectedDepartment.value = department
    hasSelected.value = true
    markAsSelected()

    const selectionData = { supplierInfo: matchedVendor, departmentInfo: department }
    const response = await updateSelection(selectionData)
    if (!response.success) throw new Error(response.message || '更新后端选择失败')

    console.log('选择已成功更新到后端。正在验证订阅...')
    const isSubscribed = await performSubscriptionCheck()

    if (isSubscribed) {
        emit('login-success', response.context)
    } else {
        loginStep.value = 'selecting' // 停留在选择界面
    }

  } catch (error) {
    console.error('配置事业部失败:', error)
    selectionError.value = error.message
    loginStep.value = 'selecting' // Return to selection screen on error
  }
}

const initialize = async () => {
  if (isLoggedIn.value) {
    await updateUsername()
    loadSavedSelections()
  }
}

const loadSavedSelections = () => {
  selectedVendor.value = getSelectedVendor()
  selectedDepartment.value = getSelectedDepartment()
  hasSelected.value = hasUserSelected()
}


defineExpose({ handleLoginSuccess })

onMounted(initialize)
</script>

<style scoped>
/* Main Container */
.account-manager-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

/* Sections */
.login-section,
.loading-section,
.selection-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  max-width: 400px;
}

.login-card {
  background: #fff;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  width: 100%;
}

.login-card h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
}

.tagline {
  font-size: 1rem;
  color: #666;
  margin-bottom: 30px;
}

.login-note {
  font-size: 0.8rem;
  color: #999;
  margin-top: 20px;
}

.loading-section p {
  margin-top: 20px;
  font-size: 1rem;
  color: #666;
}

.selection-content {
    width: 100%;
    background: #fff;
    padding: 30px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.selection-content h3 {
    margin-bottom: 10px;
    font-size: 1.4rem;
    color: #333;
}

.selection-content p {
    margin-bottom: 20px;
    color: #666;
}

.central-login-btn {
  padding: 15px 30px;
  font-size: 1.2rem;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #4b91f7 0%, #367af6 100%);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 15px rgba(54, 122, 246, 0.3);
  transition: all 0.3s ease;
  width: 100%;
  justify-content: center;
}

.central-login-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 20px rgba(54, 122, 246, 0.4);
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  color: #d9534f;
  background-color: #f2dede;
  border: 1px solid #ebccd1;
  padding: 10px;
  border-radius: 4px;
  margin-top: 15px;
}

/* Header Logged-in view */
.user-info-header {
  display: flex;
  align-items: center;
  gap: 15px;
}

.user-text {
  color: #333;
  font-weight: 500;
}

.user-btn {
  padding: 6px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background-color: #fff;
  cursor: pointer;
  transition: all 0.3s;
}

.user-btn:hover {
  border-color: #40a9ff;
  color: #40a9ff;
}

/* Dropdown */
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
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  z-index: 10;
  border-radius: 4px;
  overflow: hidden;
}

.dropdown:hover .dropdown-content {
  display: block;
}

.user-details {
  padding: 15px;
}

.user-details h3, .user-details h4 {
  margin: 10px 0;
  color: #333;
}

.user-details p {
  margin: 8px 0;
  font-size: 14px;
  color: #666;
}

.user-details strong {
  color: #1890ff;
}

.logout-section {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.logout-btn {
  background-color: #f44336;
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
}

.logout-btn:hover {
  background-color: #e53935;
}

.info-note {
  margin-top: 15px;
  padding: 10px;
  background-color: #e8f5e9;
  border-radius: 4px;
  border-left: 4px solid #4caf50;
  font-size: 13px;
  color: #2e7d32;
}
</style>

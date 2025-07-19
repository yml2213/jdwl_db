
import { ref, computed } from 'vue'
import { checkSubscriptionStatus } from '../services/apiService'
import { getAllCookies } from '@/utils/cookieHelper'
import { getSelectedDepartment } from '../utils/storageHelper'

export function useSubscription(sessionContext) {
  const subscriptionInfo = ref(null)
  const subscriptionLoading = ref(false)
  let pollingInterval = null

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
      console.log('Subscription polling stopped.')
    }
  }

  const startPolling = () => {
    if (pollingInterval) return // Already polling

    console.log('Starting subscription polling.')
    pollingInterval = setInterval(async () => {
      console.log('Polling for subscription status...')
      await loadSubscriptionInfo()
      if (subscriptionInfo.value?.data?.currentStatus?.isValid) {
        stopPolling()
        console.log('Subscription is valid, polling stopped.')
      }
    }, 3000) // Poll every 3 seconds

    // Stop polling after 10 minutes to avoid infinite loops
    setTimeout(stopPolling, 600000)
  }

  const remainingDays = computed(() => {
    if (!subscriptionInfo.value?.data?.currentStatus?.validUntil) return 0
    const validUntil = subscriptionInfo.value.data.currentStatus.validUntil
    const now = Date.now()
    const diff = validUntil - now
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })

  const loadSubscriptionInfo = async () => {
    console.log('=== useSubscription: 开始加载订阅信息 ===')
    subscriptionLoading.value = true
    try {
      const cookies = await getAllCookies()
      const pinCookie = cookies?.find((c) => c.name === 'pin')

      if (!pinCookie?.value) {
        console.error('❌ 无法获取用户信息')
        return
      }

      let deptId = null
      if (sessionContext.value?.departmentInfo?.deptNo) {
        deptId = sessionContext.value.departmentInfo.deptNo.replace('CBU', '')
      } else {
        const savedDepartment = getSelectedDepartment()
        if (savedDepartment?.deptNo) {
          deptId = savedDepartment.deptNo.replace('CBU', '')
        }
      }

      if (!deptId) {
        console.log('⚠️ 暂时无法获取部门信息')
        return
      }

      const username = decodeURIComponent(pinCookie.value)
      const uniqueKey = `${username}-${deptId}`

      console.log('useSubscription: 生成的uniqueKey:', uniqueKey)
      console.log('useSubscription: 正在调用订阅状态检查接口...')

      const subscriptionResult = await checkSubscriptionStatus(uniqueKey)
      console.log('useSubscription: 订阅状态检查结果:', subscriptionResult)

      if (subscriptionResult && subscriptionResult.success) {
        subscriptionInfo.value = subscriptionResult
        console.log('✅ useSubscription: 订阅信息已加载:', subscriptionInfo.value)
      } else {
        console.log('⚠️ useSubscription: 订阅状态检查返回失败或无效结果')
        subscriptionInfo.value = subscriptionResult
      }
    } catch (error) {
      console.error('❌ useSubscription: 加载订阅信息失败:', error)
    } finally {
      subscriptionLoading.value = false
      console.log('=== useSubscription: 订阅信息加载结束 ===')
    }
  }

  const renewSubscription = async () => {
    try {
      const cookies = await getAllCookies()
      const pinCookie = cookies?.find((c) => c.name === 'pin')

      if (!pinCookie?.value) {
        alert('无法获取用户信息')
        return
      }

      let deptId = null
      if (sessionContext.value?.departmentInfo?.deptNo) {
        deptId = sessionContext.value.departmentInfo.deptNo.replace('CBU', '')
      } else {
        const savedDepartment = getSelectedDepartment()
        if (savedDepartment?.deptNo) {
          deptId = savedDepartment.deptNo.replace('CBU', '')
        }
      }

      if (!deptId) {
        alert('无法获取部门信息')
        return
      }

      const username = decodeURIComponent(pinCookie.value)
      const uniqueKey = `${username}-${deptId}`

      window.electron.ipcRenderer.send('check-auth-status', { uniqueKey })
      startPolling()
      console.log('续费页面打开请求已发送')
    } catch (error) {
      console.error('打开续费页面失败:', error)
      alert('续费失败: ' + error.message)
    }
  }

  return {
    subscriptionInfo,
    subscriptionLoading,
    remainingDays,
    loadSubscriptionInfo,
    renewSubscription,
    startPolling,
    stopPolling
  }
}

import { ref, computed } from 'vue'
import { checkSubscriptionStatus } from '../services/apiService'
import { getAllCookies } from '@/utils/cookieHelper'
import { getSelectedDepartment } from '../utils/storageHelper'

export function useSubscription(sessionContext, handleLogout) {
  const subscriptionInfo = ref(null)
  const subscriptionLoading = ref(false)
  let pollingInterval = null

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
      console.log('👋 [Subscription] 轮询已停止。')
    }
  }

  const startPolling = (onSuccess) => {
    if (pollingInterval) return
    console.log('🚀 [Subscription] 开始轮询订阅状态...')
    pollingInterval = setInterval(async () => {
      await loadSubscriptionInfo(true) // true表示是轮询调用
      const isValid = subscriptionInfo.value?.data?.currentStatus?.isValid
      if (isValid) {
        console.log('✅ [Subscription] 轮询检测到有效订阅！')
        stopPolling()
        if (onSuccess) {
          onSuccess()
        }
      }
    }, 3000)

    // 10分钟后自动停止，防止意外的无限轮询
    setTimeout(() => {
      if (pollingInterval) {
        console.warn('[Subscription] 轮询超时，自动停止。')
        stopPolling()
      }
    }, 600000)
  }

  const remainingDays = computed(() => {
    if (!subscriptionInfo.value?.data?.currentStatus?.validUntil) return 0
    const validUntil = subscriptionInfo.value.data.currentStatus.validUntil
    const now = Date.now()
    const diff = validUntil - now
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  })

  const loadSubscriptionInfo = async (isPolling = false) => {
    if (!isPolling) {
      console.log('=== useSubscription: 开始加载订阅信息 ===')
      subscriptionLoading.value = true
    }
    try {
      const cookies = await getAllCookies()
      const pinCookie = cookies?.find((c) => c.name === 'pin')

      if (!pinCookie?.value) {
        if (!isPolling) console.error('❌ 无法获取用户信息')
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
        if (!isPolling) console.log('⚠️ 暂时无法获取部门信息')
        return
      }

      const username = decodeURIComponent(pinCookie.value)
      const uniqueKey = `${username}-${deptId}`

      const subscriptionResult = await checkSubscriptionStatus(uniqueKey)

      if (subscriptionResult && subscriptionResult.success) {
        subscriptionInfo.value = subscriptionResult
        if (!isPolling) console.log('✅ useSubscription: 订阅信息已加载')
      } else {
        subscriptionInfo.value = subscriptionResult
        if (!isPolling) console.log('⚠️ useSubscription: 订阅状态检查返回失败或无效结果')
      }
    } catch (error) {
      // 在轮询时，我们预期会收到404错误，所以只在非轮询或遇到非404错误时打印
      if (!isPolling || (error.message && !error.message.includes('404'))) {
        console.error('❌ useSubscription: 加载订阅信息失败:', error)
      }
    } finally {
      if (!isPolling) {
        subscriptionLoading.value = false
        console.log('=== useSubscription: 订阅信息加载结束 ===')
      }
    }
  }

  const renewSubscription = () => {
  return new Promise(async (resolve) => {
    try {
      const cookies = await getAllCookies()
      const pinCookie = cookies?.find((c) => c.name === 'pin')

      if (!pinCookie?.value) {
        alert('无法获取用户信息')
        resolve(false)
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
        resolve(false)
        return
      }

      const username = decodeURIComponent(pinCookie.value)
      const uniqueKey = `${username}-${deptId}`

      const onSubscriptionSuccess = () => {
        console.log('续费成功，停止轮询')
        stopPolling()
        window.electron.ipcRenderer.send('close-purchase-window')
        window.electron.ipcRenderer.removeListener('purchase-window-closed', onWindowClosed)
        resolve(true)
      }

      const onWindowClosed = () => {
        console.log('支付窗口关闭，但未收到成功信号')
        stopPolling()
        window.electron.ipcRenderer.removeListener('subscription-successful', onSubscriptionSuccess)
        resolve(false)
      }

      window.electron.ipcRenderer.once('subscription-successful', onSubscriptionSuccess)
      window.electron.ipcRenderer.once('purchase-window-closed', onWindowClosed)

      window.electron.ipcRenderer.send('check-auth-status', { uniqueKey })
      startPolling(onSubscriptionSuccess)
      console.log('续费页面打开请求已发送')
    } catch (error) {
      console.error('打开续费页面失败:', error)
      alert('续费失败: ' + error.message)
      resolve(false)
    }
  })
}

  const checkSubscriptionOnLoad = async () => {
    await loadSubscriptionInfo()
    if (!subscriptionInfo.value?.data?.currentStatus?.isValid) {
      const shouldRenew = confirm('您的订阅已过期或无效。是否立即续费？')
      if (shouldRenew) {
        const renewed = await renewSubscription()
        if (!renewed) {
          if (handleLogout) {
            alert('订阅无效，将退出登录。')
            handleLogout()
          }
          return false // Indicate failure
        }
      } else {
        if (handleLogout) {
          alert('订阅无效，将退出登录。')
          handleLogout()
        }
        return false // Indicate failure
      }
    }
    return true // Indicate success
  }

  return {
    subscriptionInfo,
    subscriptionLoading,
    remainingDays,
    loadSubscriptionInfo,
    renewSubscription,
    startPolling,
    stopPolling,
    checkSubscriptionOnLoad
  }
}

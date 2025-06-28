import { reactive, toRefs, onMounted, onUnmounted, readonly, ref, toRef } from 'vue'
import checkProductStatusFeature from '../features/warehouseLabeling/checkProductStatus.js'
import enableStoreProductsFeature from '../features/warehouseLabeling/enableStoreProducts.js'

/**
 * 一个通用的、可复用的任务执行器 (Vue Composable)
 * @param {object} featureDefinition - 功能定义对象，包含 name, label 和核心执行函数 execute
 */
export function useTask(featureDefinition) {
  // 响应式状态，用于驱动UI更新
  const state = reactive({
    isRunning: false,
    status: 'idle', // idle | running | success | error | batching
    logs: [],
    results: [],
    progress: { current: 0, total: 0 },
    // 新增: 专门用于处理停用商品的状态
    disabledProducts: {
      items: [],
      checking: false,
      enabling: false,
      checkError: '',
      enableError: '',
      currentBatch: 0,
      totalBatches: 0,
      progress: '初始化...'
    }
  })

  const error = ref(null)

  /**
   * 记录日志
   * @param {string} message - 日志信息
   * @param {'info' | 'success' | 'error' | 'warning' | 'step'} type - 日志类型
   */
  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    state.logs.unshift({ timestamp, message, type }) // 使用 unshift 将最新日志放在最前面
    console.log(`[useTask Log - ${type}]: ${message}`)
  }

  onMounted(() => {
    const handleLog = (event, logData) => {
      log(`[IPC] ${logData.message}`, logData.type)
    }
    window.electron.ipcRenderer.on('ipc-log', handleLog)

    onUnmounted(() => {
      window.electron.ipcRenderer.removeListener('ipc-log', handleLog)
    })
  })

  // 检查商品状态 (内部函数)
  const checkStatus = async (context) => {
    state.disabledProducts.checking = true
    state.disabledProducts.checkError = ''
    state.disabledProducts.items = []
    log('开始检查商品状态...', 'info')
    try {
      const result = await checkProductStatusFeature.execute(context.skus, log)
      if (result.disabledProducts.length > 0) {
        log(`发现 ${result.disabledProducts.length} 个停用商品。`, 'warning')
      }
      state.disabledProducts.items = result.disabledProducts
    } catch (e) {
      state.disabledProducts.checkError = e.message
      log(`检查商品状态失败: ${e.message}`, 'error')
    } finally {
      state.disabledProducts.checking = false
    }
  }

  // 启用商品 (暴露给外部使用)
  const enableProducts = async (context) => {
    state.disabledProducts.enabling = true
    state.disabledProducts.enableError = ''
    log('开始启用停用商品...', 'info')
    try {
      const result = await enableStoreProductsFeature.execute(
        { ...context, skus: state.disabledProducts.items.map((p) => p.sellerGoodsSign) },
        { log, isRunning: readonly(toRef(state, 'isRunning')) }
      )
      log('启用商品成功！', 'success')
      // 成功后清空停用列表
      state.disabledProducts.items = []
      return result
    } catch (e) {
      state.disabledProducts.enableError = e.message
      log(`启用商品失败: ${e.message}`, 'error')
      throw e
    } finally {
      state.disabledProducts.enabling = false
    }
  }

  /**
   * 主执行函数
   * @param {object} context - 执行任务所需的上下文，例如 { skuList, shopInfo, options }
   * @returns {Promise<void>}
   */
  const execute = async (context) => {
    // 1. 初始化状态
    state.isRunning = true
    state.status = 'running'
    state.logs.length = 0
    state.results = []
    state.progress = { current: 0, total: 0 }
    error.value = null
    const taskLabel = context.taskName || featureDefinition.label
    log(`任务 "${taskLabel}" 开始...`, 'info')

    // 如果是入仓打标流程，先检查状态
    if (featureDefinition.name === 'warehouseLabelingFlow') {
      await checkStatus(context)
      if (state.disabledProducts.items.length > 0) {
        log('检测到停用商品，请先启用它们或在流程选项中勾选"启用店铺商品"。', 'warning')
        // 可以选择在这里暂停，或者让流程继续
      }
    }

    try {
      // 2. 定义传递给核心逻辑的辅助函数
      const helpers = {
        log,
        updateProgress: (current, total) => {
          state.progress = { current, total }
        },
        isRunning: readonly(toRef(state, 'isRunning'))
      }

      // 3. 调用功能定义中的核心逻辑
      const resultData = await featureDefinition.execute(context, helpers)

      // 4. 处理成功结果
      state.results.push(resultData)
      state.status = 'success'
      log(`任务 "${taskLabel}" 成功完成。`, 'success')
      return resultData
    } catch (e) {
      // 5. 处理异常
      console.error(`[useTask] 任务 "${taskLabel}" 执行失败:`, e)
      state.status = 'error'
      error.value = e
      const errorMessage = e.message || '发生未知错误'
      log(errorMessage, 'error')
      throw e
    } finally {
      // 6. 结束运行状态
      state.isRunning = false
    }
  }

  return {
    ...toRefs(state),
    error,
    execute,
    enableProducts // 将启用函数暴露出去
  }
}

// 物流属性导入功能封装

import { getAllCookies } from '../../utils/cookieHelper'
import { executeInBatches } from './utils/taskUtils'

const BATCH_SIZE = 2000
const BATCH_DELAY = 5 * 60 * 1000 // 5 minutes

export default {
  name: 'logisticsAttributes',
  label: '导入物流属性',
  execute: async (context, helpers) => {
    const { log, isRunning } = helpers
    const { skus: skuList, store, csgList } = context

    log('开始执行[导入物流属性]流程...')

    // 1. 获取必要的上下文信息
    if (!store || !store.deptNo) {
      throw new Error('无法获取有效的事业部信息，流程终止。')
    }
    log(`已获取事业部信息: ${store.deptName}`)

    const cookies = await getAllCookies()
    if (!cookies || cookies.length === 0) {
      throw new Error('无法获取登录Cookies，流程终止。')
    }
    log('已获取登录凭证。')

    // 使用 csgList 替代 skuList
    const itemsToProcess = csgList || skuList
    if (!itemsToProcess || itemsToProcess.length === 0) {
      throw new Error('没有可供处理的商品列表（SKU或CSG）。')
    }
    log(`将为 ${itemsToProcess.length} 个商品导入物流属性...`, 'info')


    // 提取需要的物流参数，并确保它们是普通值
    const logisticsOpts = context.options?.logistics || {}
    const payloadOptions = {
      length: logisticsOpts.length,
      width: logisticsOpts.width,
      height: logisticsOpts.height,
      grossWeight: logisticsOpts.grossWeight // 使用 grossWeight
    }

    const batchFn = async (batchItems) => {
      return await window.electron.ipcRenderer.invoke('import-logistics-properties', {
        skuList: JSON.parse(JSON.stringify(batchItems)), // 主进程可能期望的还是skuList
        departmentInfo: JSON.parse(JSON.stringify(store)),
        cookies: JSON.parse(JSON.stringify(cookies)),
        logisticsOptions: payloadOptions
      })
    }

    const result = await executeInBatches({
      items: itemsToProcess,
      batchSize: BATCH_SIZE,
      delay: BATCH_DELAY,
      batchFn,
      log,
      isRunning
    })

    if (result && result.success) {
      log('所有批次的物流属性导入成功完成。', 'success')
      return result
    } else {
      log(`物流属性导入过程中发生错误: ${result.message}`, 'error')
      throw new Error(result.message || '物流属性导入失败')
    }
  }
}

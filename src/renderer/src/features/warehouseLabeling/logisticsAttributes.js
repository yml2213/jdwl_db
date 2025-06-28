// 物流属性导入功能封装

import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'logisticsAttributes',
  label: '导入物流属性',
  execute: async (context, helpers) => {
    const { log } = helpers
    const { skus: skuList, store } = context

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

    // 2. 使用 invoke/handle 模式发送请求到主进程
    try {
      log('向主进程发送导入请求...')

      // 提取需要的物流参数，并确保它们是普通值
      const logisticsOpts = context.options?.logistics || {}
      const payloadOptions = {
        length: logisticsOpts.length,
        width: logisticsOpts.width,
        height: logisticsOpts.height,
        grossWeight: logisticsOpts.grossWeight // 使用 grossWeight
      }

      const result = await window.electron.ipcRenderer.invoke('import-logistics-properties', {
        skuList: JSON.parse(JSON.stringify(skuList)),
        departmentInfo: JSON.parse(JSON.stringify(store)), // 确保store是纯JS对象
        cookies: JSON.parse(JSON.stringify(cookies)),
        logisticsOptions: payloadOptions
      })

      if (result.success) {
        log('主进程成功完成物流属性导入。')
        return result
      } else {
        log(`主进程返回错误: ${result.message}`, 'error')
        throw new Error(result.message || '主进程返回了一个未指定的错误')
      }
    } catch (error) {
      log(`与主进程通信时发生错误: ${error.message}`, 'error')
      // 重新抛出错误，以便任务流可以捕获它
      throw error
    }
  }
}

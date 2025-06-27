// 物流属性导入功能封装

import { getSelectedDepartment } from '../../utils/storageHelper'
import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'logisticsAttributes',
  label: '导入物流属性',
  execute: async (context, helpers) => {
    const { log, updateProgress } = helpers
    const { skuList } = context

    log('开始执行[导入物流属性]流程...')

    // 1. 获取必要的上下文信息
    const departmentInfo = getSelectedDepartment()
    if (!departmentInfo) {
      throw new Error('无法获取事业部信息，流程终止。')
    }
    log(`已获取事业部信息: ${departmentInfo.deptName}`)

    const cookies = await getAllCookies()
    if (!cookies || cookies.length === 0) {
      throw new Error('无法获取登录Cookies，流程终止。')
    }
    log('已获取登录凭证。')

    // 2. 设置IPC监听器
    return new Promise((resolve, reject) => {
      // 监听主进程的日志更新
      const logListener = (event, message) => {
        log(message)
      }
      window.ipcRenderer.on('import-logistics-properties-log', logListener)

      // 监听最终结果
      window.ipcRenderer.once('import-logistics-properties-reply', (event, result) => {
        // 清理日志监听器
        window.ipcRenderer.removeListener('import-logistics-properties-log', logListener)

        if (result.success) {
          log('主进程成功完成物流属性导入。')
          // 可以在这里对 result 进行处理，然后 resolve
          resolve(result)
        } else {
          log(`主进程返回错误: ${result.message}`, 'error')
          reject(new Error(`主进程返回错误: ${result.message}`))
        }
      })

      // 3. 发送请求到主进程
      log('向主进程发送导入请求...')
      window.ipcRenderer.send('import-logistics-properties', {
        skuList,
        departmentInfo,
        cookies
      })
    })
  }
}

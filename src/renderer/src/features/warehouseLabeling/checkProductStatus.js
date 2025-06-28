import { executeTask } from '../../services/apiService'
import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'

/**
 * 主执行函数 - 重构后
 * @param {string[]} skusToCheck - 需要检查状态的SKU列表
 * @param {function} log - 日志回调函数
 * @returns {Promise<Object>} - 返回包含已停用和已启用商品列表的对象
 */
async function mainExecute(skusToCheck, log = console.log) {
  if (!skusToCheck || skusToCheck.length === 0) {
    log('没有需要检查状态的SKU。', 'warn')
    return { disabledProducts: [], enabledProducts: [] }
  }

  log(`开始将 ${skusToCheck.length} 个SKU 的状态检查任务提交到后端...`, 'info')

  try {
    // 准备发送到后端的 payload
    const payload = {
      skus: skusToCheck,
      store: getSelectedShop(),
      department: getSelectedDepartment()
    }

    // 调用通用的任务执行接口，任务名称与后端任务文件名一致
    const result = await executeTask('checkProductStatus', payload)

    if (result && result.success) {
      log(
        `后端任务执行成功。停用: ${result.disabledProducts.length}个, 启用: ${result.enabledProducts.length}个。`,
        'success'
      )
      // 返回与旧函数一致的结构
      return {
        disabledProducts: result.disabledProducts || [],
        enabledProducts: result.enabledProducts || []
      }
    } else {
      const errorMessage = result ? result.message : '未知错误'
      log(`后端任务执行失败: ${errorMessage}`, 'error')
      throw new Error(errorMessage)
    }
  } catch (error) {
    log(`调用后端任务时发生网络或未知错误: ${error.message}`, 'error')
    throw error // 重新抛出错误，以便上层可以捕获
  }
}

export default {
  name: 'checkProductStatus',
  label: '检查商品状态(停用)',
  execute: mainExecute
}

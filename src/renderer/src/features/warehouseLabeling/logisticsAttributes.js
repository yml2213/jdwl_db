// 物流属性导入功能封装

import { ref } from 'vue'
import { executeOneTask } from './taskExecutor'
import { getSelectedDepartment } from '../../utils/storageHelper'

/**
 * 创建物流属性导入状态和方法
 * @returns {Object} 包含状态和方法的对象
 */
export function useLogisticsAttributes(taskList, currentShopInfo) {
  // 物流属性导入状态
  const logisticsImport = ref({
    showDialog: false,
    uploading: false,
    success: false,
    error: '',
    progress: '',
    currentBatch: 0,
    totalBatches: 0,
    tempSave: false // 是否暂存，不立即执行
  })

  /**
   * 打开物流属性导入对话框
   * @param {string} skuText - 输入的SKU文本
   */
  const openLogisticsImporter = (skuText) => {
    // 检查是否输入了SKU
    if (!skuText) {
      alert('请先输入SKU')
      return
    }

    // 解析SKU列表
    const skuList = skuText.split(/\r?\n/).filter((line) => line.trim())
    if (skuList.length === 0) {
      alert('请至少输入一个有效的SKU')
      return
    }

    // 检查是否选择了事业部
    const department = getSelectedDepartment()
    if (!department) {
      alert('请先选择事业部')
      return
    }

    // 设置对话框状态并显示
    logisticsImport.value.showDialog = true
  }

  // 关闭物流属性导入对话框
  const closeLogisticsImporter = () => {
    logisticsImport.value.showDialog = false
  }

  // 提交物流属性数据
  const submitLogisticsData = async (data) => {
    console.log('提交物流属性数据:', data)
    const tempSave = data.tempSave || false

    try {
      // 重置导入状态
      logisticsImport.value.uploading = true
      logisticsImport.value.success = false
      logisticsImport.value.error = ''
      logisticsImport.value.progress = tempSave ? '准备暂存...' : '准备导入...'
      logisticsImport.value.currentBatch = 0
      logisticsImport.value.totalBatches = Math.ceil(data.skuList.length / 500)

      // 创建正确的任务对象
      const task = {
        id: Date.now().toString(),
        skuList: data.skuList,
        sku: `物流属性导入 (${data.skuList.length}个SKU)`,
        创建时间: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        状态: tempSave ? '暂存' : '等待中',
        结果: tempSave ? '等待批量处理' : '',
        选项: {
          importStore: false,
          useStore: false,
          importProps: true,
          useMainData: false,
          useWarehouse: false,
          useJdEffect: false,
          importTitle: false,
          useBatchManage: false,
          isTempSaved: tempSave // 标记为暂存任务
        }
      }

      // 添加到任务列表
      taskList.value.push(task)

      // 如果是暂存，则直接返回
      if (tempSave) {
        logisticsImport.value.uploading = false
        logisticsImport.value.success = true
        logisticsImport.value.progress = '暂存成功，等待批量处理'

        // 显示提示并关闭对话框
        alert('物流属性设置已暂存，请在任务列表中查看')
        setTimeout(() => {
          logisticsImport.value.showDialog = false
        }, 1000)
        return
      }

      // 获取当前选中的店铺（即使不需要，但保持参数结构一致）
      const shopInfo = currentShopInfo.value || {}

      // 执行任务
      const result = await executeOneTask(task, shopInfo, task.选项)

      console.log('导入物流属性结果:', result)

      // 更新任务状态 - 修复状态更新问题，确保正确处理API返回状态
      if (result && result.success === true) {
        // 任务成功执行
        task.状态 = '成功'
        // 使用正确的字段，data或message
        task.结果 = result.data || result.message || '导入物流属性成功'
      } else {
        // 任务执行失败
        // 检查是否是部分成功
        if (result && result.isPartialSuccess) {
          task.状态 = '部分成功'
          task.结果 = result.data || result.message || '导入部分成功，请查看日志'
        } else {
          task.状态 = '失败'
          // 处理不同格式的错误响应
          let errorMessage = '导入失败，未知原因'

          // 如果是API返回的错误信息
          if (result) {
            if (typeof result.data === 'string' && result.data.trim() !== '') {
              // 优先使用data字段中的错误信息
              errorMessage = result.data
            } else if (typeof result.tipMsg === 'string' && result.tipMsg.trim() !== '') {
              // 其次使用tipMsg
              errorMessage = result.tipMsg
            } else if (typeof result.message === 'string' && result.message.trim() !== '') {
              // 最后使用message
              errorMessage = result.message
            }
          }

          task.结果 = errorMessage
        }
      }

      // 更新导入状态
      logisticsImport.value.success = result && result.success
      logisticsImport.value.uploading = false
      logisticsImport.value.progress =
        result && result.success ? `导入成功: ${result.taskId || ''}` : '导入失败'

      // 生成提示信息
      if (result && result.success) {
        alert(`物流属性导入成功！\n${result.data || result.message || ''}`)
      } else if (result && result.isPartialSuccess) {
        alert(`物流属性导入受限: ${result.data || result.message || ''}`)
      } else {
        // 显示错误提示
        alert(`物流属性导入失败: ${task.结果}`)
      }

      // 关闭对话框
      setTimeout(() => {
        logisticsImport.value.showDialog = false
      }, 1500)
    } catch (error) {
      console.error('导入物流属性失败:', error)
      logisticsImport.value.error = `导入失败: ${error.message || '未知错误'}`
      logisticsImport.value.uploading = false

      // 更新任务状态为失败
      if (taskList.value.length > 0) {
        const lastTask = taskList.value[taskList.value.length - 1]
        if (lastTask && (lastTask.状态 === '等待中' || lastTask.状态 === '暂存')) {
          lastTask.状态 = '失败'
          lastTask.结果 = error.message || '执行出错'
        }
      }

      alert(`物流属性导入失败: ${error.message || '未知错误'}`)
    }
  }

  return {
    logisticsImport,
    openLogisticsImporter,
    closeLogisticsImporter,
    submitLogisticsData
  }
}

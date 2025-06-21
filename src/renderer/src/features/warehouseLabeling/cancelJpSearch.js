import { getAllCookies } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'
import { getCSGList as getCSGListFromApi } from '../../services/apiService'

export default {
  name: 'cancelJpSearch',
  label: '取消京配打标',

  /**
   * 执行取消京配打标
   * @param {Array} skuList SKU列表
   * @param {Object} task 任务对象
   * @param {Function} createBatchTask 创建批次任务的回调函数
   * @returns {Object} 执行结果
   */
  async execute(skuList, task, createBatchTask) {
    // 初始化日志
    if (!window.cancelJpSearchLogs) {
      window.cancelJpSearchLogs = []
    }

    console.log('取消京配打标功能被调用:', {
      skuList: skuList ? `${skuList.length}个SKU` : '无SKU',
      task: task ? `ID: ${task.id}, 状态: ${task.状态}` : '无任务',
      createBatchTask: typeof createBatchTask === 'function' ? '已提供' : '未提供'
    })

    // 初始化返回结果
    const result = {
      success: false,
      message: '',
      cancelJpSearchLogs: []
    }

    try {
      console.log(`开始处理SKU列表，总数：${skuList.length}`)
      // const startTime = new Date();

      // 记录总SKU数
      result.cancelJpSearchLogs.push({
        type: 'info',
        message: `开始处理，总SKU数：${skuList.length}`,
        time: new Date().toLocaleString()
      })

      // 检查是否是整店操作
      const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'

      console.log('是否是整店操作:', isWholeStore)
      
      if (isWholeStore) {
        // 整店取消京配打标操作
        console.log('执行整店取消京配打标操作')
        return await this._processWholeStoreCancelJpSearch(task)
      } else {
        console.log('执行SKU列表取消京配打标操作')
        // 如果SKU数量大于2000，需要分批处理
        if (skuList.length > 2000) {
          // 主任务标记为已分批
          if (task) {
            task.状态 = '已分批'
            task.结果 = [`已将任务分拆为${Math.ceil(skuList.length / 2000)}个批次任务`]
          }

          result.cancelJpSearchLogs.push({
            type: 'warning',
            message: `SKU数量(${skuList.length})超过2000，已分拆为${Math.ceil(skuList.length / 2000)}个批次任务`,
            time: new Date().toLocaleString()
          })

          // 将SKU列表分成多个批次，每批最多2000个SKU
          const batches = []
          for (let i = 0; i < skuList.length; i += 2000) {
            batches.push(skuList.slice(i, i + 2000))
          }

          console.log(`已将SKU列表分成${batches.length}个批次`)

          // 为每个批次创建一个独立任务
          for (let i = 0; i < batches.length; i++) {
            const batchSkuList = batches[i]
            const batchNumber = i + 1

            // 创建批次任务
            const batchTask = {
              id: `${task.id}-batch-${batchNumber}`,
              sku: `${task.sku}-批次${batchNumber}/${batches.length}`,
              skuList: batchSkuList,
              状态: i === 0 ? '处理中' : '等待中',
              创建时间: new Date().toISOString(),
              原始任务ID: task.id,
              批次编号: batchNumber,
              总批次数: batches.length,
              选项: task.选项 || { cancelJpSearch: true }, // 继承原任务选项
              结果: [],
              cancelJpSearchLogs: [{
                type: 'info',
                message: `批次${batchNumber}/${batches.length} - 开始处理${batchSkuList.length}个SKU`,
                time: new Date().toLocaleString()
              }]
            }

            // 使用回调函数添加批次任务到任务列表
            if (typeof createBatchTask === 'function') {
              createBatchTask(batchTask)
            }

            // 如果是第一个批次，立即开始处理
            if (i === 0) {
              // 处理第一个批次的SKU
              const batchResult = await this._processBatch(batchSkuList, batchTask)
              result.cancelJpSearchLogs = result.cancelJpSearchLogs.concat(batchResult.cancelJpSearchLogs)

                    // 更新批次任务状态
      batchTask.状态 = batchResult.success ? '成功' : '失败'
      batchTask.结果 = batchResult.results || []
      batchTask.importLogs = batchResult.cancelJpSearchLogs  // 使用importLogs作为统一的日志属性名
      batchTask.cancelJpSearchLogs = batchResult.cancelJpSearchLogs

              // 通知UI更新
              if (typeof createBatchTask === 'function') {
                createBatchTask(batchTask)
              }
            }
          }

          // 设置总体处理结果
          result.success = true
          result.message = `已将任务分拆为${batches.length}个批次任务，第一批次已处理完成`

          return result
        } else {
          // SKU数量不超过2000，直接处理
          return await this._processBatch(skuList, task)
        }
      }
    } catch (error) {
      console.error('处理SKU出错:', error)

      result.success = false
      result.message = `处理失败: ${error.message || '未知错误'}`
      result.cancelJpSearchLogs.push({
        type: 'error',
        message: `处理失败: ${error.message || '未知错误'}`,
        time: new Date().toLocaleString()
      })

      return result
    }
  },

  /**
   * 处理整店取消京配打标
   * @param {Object} task 任务对象
   * @returns {Object} 处理结果
   */
  async _processWholeStoreCancelJpSearch(task) {
    const result = {
      success: false,
      message: '',
      cancelJpSearchLogs: [],
      results: []
    }
    
    try {
      // 记录开始时间
      const startTime = new Date()
      
      result.cancelJpSearchLogs.push({
        type: 'info',
        message: `开始执行整店取消京配打标`,
        time: startTime.toLocaleString()
      })
      
      // 更新任务状态为处理中
      if (task) {
        task.状态 = '处理中'
        task.结果 = [`正在执行整店取消京配打标`]
      }
      
      // 获取店铺信息
      const shopInfo = task.店铺信息 || {}
      console.log('整店取消京配打标 - 店铺信息:', shopInfo)
      
      if (!shopInfo.shopNo) {
        throw new Error('未提供店铺信息，无法执行整店取消京配打标')
      }

      // 调用整店取消京配打标API
      console.log('调用整店取消京配打标API')
      const cancelResult = await this._callCancelJpSearchAPI(['WHOLE_STORE'], shopInfo)
      
      // 记录处理结果
      const endTime = new Date()
      const processingTime = (endTime - startTime) / 1000 // 秒
      
      // 根据结果设置成功/失败状态
      result.success = cancelResult.success
      result.message = cancelResult.message
      result.results.push(result.message)
      
      result.cancelJpSearchLogs.push({
        type: cancelResult.success ? 'success' : 'error',
        message: result.message,
        time: endTime.toLocaleString(),
        processingTime
      })
      
      // 更新任务状态
      if (task) {
        task.状态 = cancelResult.success ? '成功' : '失败'
        task.结果 = result.results
        task.importLogs = result.cancelJpSearchLogs  // 使用importLogs作为统一的日志属性名
        task.cancelJpSearchLogs = result.cancelJpSearchLogs
      }
      
      return result
    } catch (error) {
      console.error('整店取消京配打标出错:', error)
      
      result.success = false
      result.message = `整店取消京配打标失败: ${error.message || '未知错误'}`
      result.cancelJpSearchLogs.push({
        type: 'error',
        message: result.message,
        time: new Date().toLocaleString()
      })
      
      if (task) {
        task.状态 = '失败'
        task.结果 = [result.message]
        task.importLogs = result.cancelJpSearchLogs  // 使用importLogs作为统一的日志属性名
        task.cancelJpSearchLogs = result.cancelJpSearchLogs
      }
      
      return result
    }
  },

  /**
   * 处理一个批次的SKU
   * @param {Array} skuList 批次中的SKU列表
   * @param {Object} task 任务对象
   * @returns {Object} 处理结果
   */
  async _processBatch(skuList, task) {
    const result = {
      success: false,
      message: '',
      cancelJpSearchLogs: [],
      results: []
    }

    try {
      // 记录批次开始时间
      const startTime = new Date()

      result.cancelJpSearchLogs.push({
        type: 'info',
        message: `开始处理${skuList.length}个SKU`,
        time: startTime.toLocaleString()
      })

      // 更新任务状态为处理中
      if (task) {
        task.状态 = '处理中'
        task.结果 = [`正在处理${skuList.length}个SKU`]
      }

      // 首先获取CSG列表
      const csgList = await this.getCSGList(skuList)
      if (!csgList || csgList.length === 0) {
        throw new Error('获取CSG列表失败')
      }

      // 实际处理SKU - 调用上传方法
      const uploadResult = await this.uploadCancelJpSearchData(csgList)

      // 记录处理结果
      const endTime = new Date()
      const processingTime = (endTime - startTime) / 1000 // 秒

      // 根据上传结果设置成功/失败状态
      result.success = uploadResult.success
      result.message = uploadResult.message
      result.results.push(result.message)

      result.cancelJpSearchLogs.push({
        type: uploadResult.success ? 'success' : 'error',
        message: result.message,
        time: endTime.toLocaleString(),
        successCount: uploadResult.processedCount || 0,
        failedCount: uploadResult.failedCount || 0,
        processingTime
      })

      // 更新任务状态
      if (task) {
        task.状态 = uploadResult.success ? '成功' : '失败'
        task.结果 = result.results
        task.importLogs = result.cancelJpSearchLogs  // 使用importLogs作为统一的日志属性名
        task.cancelJpSearchLogs = result.cancelJpSearchLogs
      }

      return result
    } catch (error) {
      console.error('处理批次出错:', error)

      result.success = false
      result.message = `批次处理失败: ${error.message || '未知错误'}`
      result.cancelJpSearchLogs.push({
        type: 'error',
        message: result.message,
        time: new Date().toLocaleString()
      })
      result.results.push(result.message)

      // 更新任务状态
      if (task) {
        task.状态 = '失败'
        task.结果 = result.results
        task.importLogs = result.cancelJpSearchLogs  // 使用importLogs作为统一的日志属性名
        task.cancelJpSearchLogs = result.cancelJpSearchLogs
      }

      return result
    }
  },

  /**
   * 获取CSG列表
   * @param {Array<string>} skuList - SKU列表
   * @returns {Promise<Array<string>>} CSG列表
   */
  async getCSGList(skuList) {
    try {
      const result = await getCSGListFromApi(skuList)

      if (!result.success) {
        throw new Error(result.message || '获取CSG列表失败')
      }

      if (!result.csgList || result.csgList.length === 0) {
        throw new Error('未找到对应的CSG编号')
      }

      return result.csgList
    } catch (error) {
      console.error('获取CSG列表失败:', error)
      throw error
    }
  },

  /**
   * 调用取消京配打标API
   * @param {Array<string>} skuList - SKU列表
   * @param {Object} shopInfo - 店铺信息
   * @returns {Promise<Object>} 处理结果
   */
  async _callCancelJpSearchAPI(skuList, shopInfo) {
    try {
      const isWholeStore = skuList.length === 1 && skuList[0] === 'WHOLE_STORE'
      
      // 调用API
      const result = await window.api.cancelJdDeliveryTag(skuList, shopInfo)
      
      if (result.success) {
        return {
          success: true,
          message: isWholeStore ? `成功取消整店京配打标` : `成功取消${skuList.length}个SKU的京配打标`
        }
      } else {
        return {
          success: false,
          message: result.message || '取消京配打标失败'
        }
      }
    } catch (error) {
      console.error('调用取消京配打标API失败:', error)
      return {
        success: false,
        message: `取消京配打标失败: ${error.message || '未知错误'}`
      }
    }
  },

  /**
   * 上传取消京配打标数据
   * @param {Array<string>} csgList - CSG列表
   * @returns {Promise<Object>} 上传结果
   */
  async uploadCancelJpSearchData(csgList) {
    try {
      console.log(`开始上传取消京配打标数据，CSG数量：${csgList.length}`)

      // 创建Excel数据
      const excelData = this.createExcelData(csgList)

      // 转换为Excel文件
      const excelFile = await this.convertToExcelFile(excelData)

      // 获取csrfToken
      const cookies = await getAllCookies()
      const csrfTokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
      const csrfToken = csrfTokenCookie ? csrfTokenCookie.value : ''

      if (!csrfToken) {
        throw new Error('无法获取csrfToken')
      }

      // 创建FormData
      const formData = new FormData()
      formData.append('csrfToken', csrfToken)
      formData.append('updateShopGoodsJpSearchListFile', excelFile, 'updateShopGoodsJpSearchImportTemplate.xls')

      // 序列化FormData
      const serializedFormData = await this.serializeFormData(formData)

      // 发送请求
      const response = await window.api.sendRequest(
        'https://o.jdl.com/shopGoods/importUpdateShopGoodsJpSearch.do?_r=' + Math.random(),
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
            'cache-control': 'no-cache',
            'origin': 'https://o.jdl.com',
            'pragma': 'no-cache',
            'referer': 'https://o.jdl.com/goToMainIframe.do',
            'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"'
          },
          body: serializedFormData
        }
      )

      console.log('取消京配打标响应:', response)

      // 检查响应
      if (response && response.resultCode === 1) {
        return {
          success: true,
          message: response.resultMessage || '取消京配打标成功',
          processedCount: csgList.length,
          taskId: response.resultData ? response.resultData.replace(/.*任务编号：([^,]+).*/, '$1') : null
        }
      } else {
        return {
          success: false,
          message: response.resultMessage || response.msg || '取消京配打标失败',
          failedCount: csgList.length
        }
      }
    } catch (error) {
      console.error('上传取消京配打标数据失败:', error)
      return {
        success: false,
        message: `上传失败: ${error.message || '未知错误'}`,
        failedCount: csgList.length
      }
    }
  },

  /**
   * 创建Excel数据
   * @param {Array<string>} csgList - CSG列表
   * @returns {Array<Array<string>>} Excel数据
   */
  createExcelData(csgList) {
    // 表头
    const header = ['店铺商品编号（CSG编码）', '是否京配（0-否，1-是）']

    // 数据行
    const rows = csgList.map(csg => [csg, '0'])

    // 返回包含表头的数据
    return [header, ...rows]
  },

  /**
   * 将数据转换为Excel文件
   * @param {Array<Array<string>>} data - Excel数据
   * @returns {Promise<File>} Excel文件
   */
  async convertToExcelFile(data) {
    // 创建工作表
    const ws = XLSX.utils.aoa_to_sheet(data)

    // 创建工作簿并添加工作表
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

    // 生成Excel二进制数据
    const excelBinary = XLSX.write(wb, {
      bookType: 'xls',
      type: 'binary',
      compression: true
    })

    // 将二进制字符串转换为ArrayBuffer
    const buf = new ArrayBuffer(excelBinary.length)
    const view = new Uint8Array(buf)
    for (let i = 0; i < excelBinary.length; i++) {
      view[i] = excelBinary.charCodeAt(i) & 0xff
    }

    // 创建File对象
    return new File([buf], 'updateShopGoodsJpSearchImportTemplate.xls', {
      type: 'application/vnd.ms-excel'
    })
  },

  /**
   * 序列化FormData对象
   * @param {FormData} formData - FormData对象
   * @returns {Promise<Object>} 序列化后的FormData对象
   */
  async serializeFormData(formData) {
    const entries = []

    // 遍历FormData中的每个字段
    for (const pair of formData.entries()) {
      const [key, value] = pair

      // 如果是文件，需要特殊处理
      if (value instanceof File || value instanceof Blob) {
        // 转换文件为ArrayBuffer
        const buffer = await value.arrayBuffer()

        // 创建序列化文件对象
        entries.push([
          key,
          {
            _isFile: true,
            name: value.name,
            type: value.type,
            size: value.size,
            lastModified: value instanceof File ? value.lastModified : null,
            data: Array.from(new Uint8Array(buffer)) // 将ArrayBuffer转换为数组
          }
        ])
      } else {
        // 普通字段直接添加
        entries.push([key, value])
      }
    }

    // 返回序列化的FormData对象
    return {
      _isFormData: true,
      entries
    }
  }
} 
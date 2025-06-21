import { getAllCookies, getRequestHeaders } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'
import { getCSGList as getCSGListFromApi, getShopGoodsList, getShopInfoByName } from '../../services/apiService'

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
        
        // 检查是否是批次任务
        const isBatchTask = task && task.原始任务ID && task.批次编号
        
        if (isBatchTask) {
          console.log(`处理批次任务: ${task.批次编号}/${task.总批次数}`)
          
          // 如果是批次任务，直接处理SKU列表
          const batchResult = await this._processBatch(skuList, task)
          
          // 更新批次任务状态
          if (task) {
            task.状态 = batchResult.success ? '成功' : '失败'
            task.结果 = batchResult.results || []
            task.importLogs = batchResult.cancelJpSearchLogs  // 使用importLogs作为统一的日志属性名
            task.cancelJpSearchLogs = batchResult.cancelJpSearchLogs
          }
          
          return batchResult
        }
        
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
              店铺信息: task.店铺信息, // 传递店铺信息
              事业部信息: task.事业部信息, // 传递事业部信息
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
      
      // 获取店铺信息和事业部信息
      const shopInfo = task.店铺信息 || {}
      const deptInfo = task.事业部信息 || {}
      
      console.log('整店取消京配打标 - 店铺信息:', shopInfo)
      console.log('整店取消京配打标 - 店铺信息详细内容:', JSON.stringify(shopInfo))
      console.log('整店取消京配打标 - 事业部信息:', deptInfo)
      console.log('整店取消京配打标 - 事业部信息详细内容:', JSON.stringify(deptInfo))
      
      if (!shopInfo.shopNo) {
        throw new Error('未提供店铺信息，无法执行整店取消京配打标')
      }
      
      // 合并店铺和事业部信息
      const completeShopInfo = {
        ...shopInfo,
        deptId: deptInfo.id || '',
        deptNo: deptInfo.deptNo || '',
        sellerId: deptInfo.sellerId || '',
        sellerNo: deptInfo.sellerNo || ''
      }
      
      console.log('整店取消京配打标 - 合并后的完整信息:', completeShopInfo)

      // 获取整店CSG列表
      result.cancelJpSearchLogs.push({
        type: 'info',
        message: `正在获取整店商品CSG编号...`,
        time: new Date().toLocaleString()
      })
      
      // 调用API获取整店商品CSG列表
      const csgListResult = await getShopGoodsList(completeShopInfo)
      
      if (!csgListResult.success || !csgListResult.csgList || csgListResult.csgList.length === 0) {
        throw new Error(`获取整店商品CSG列表失败: ${csgListResult.message || '未找到商品'}`)
      }
      
      const csgList = csgListResult.csgList
      
      result.cancelJpSearchLogs.push({
        type: 'success',
        message: `成功获取整店商品CSG列表，共${csgList.length}个商品`,
        time: new Date().toLocaleString()
      })
      
      // 判断是否需要分批处理
      if (csgList.length > 5000) {
        result.cancelJpSearchLogs.push({
          type: 'warning',
          message: `商品数量(${csgList.length})超过5000，需要分批处理`,
          time: new Date().toLocaleString()
        })
        
        // 将CSG列表分成多个批次，每批最多5000个
        const batches = []
        for (let i = 0; i < csgList.length; i += 5000) {
          batches.push(csgList.slice(i, i + 5000))
        }
        
        console.log(`已将整店CSG列表分成${batches.length}个批次`)
        
        // 记录分批信息
        result.cancelJpSearchLogs.push({
          type: 'info',
          message: `已将整店CSG列表分成${batches.length}个批次，开始逐批处理`,
          time: new Date().toLocaleString()
        })
        
        // 逐批处理
        let successCount = 0
        let failedCount = 0
        
        for (let i = 0; i < batches.length; i++) {
          const batchCsgList = batches[i]
          const batchNumber = i + 1
          
          result.cancelJpSearchLogs.push({
            type: 'info',
            message: `开始处理第${batchNumber}/${batches.length}批，包含${batchCsgList.length}个商品`,
            time: new Date().toLocaleString()
          })
          
          // 处理当前批次
          const batchResult = await this.uploadCancelJpSearchData(batchCsgList)
          
          if (batchResult.success) {
            successCount += batchCsgList.length
            result.cancelJpSearchLogs.push({
              type: 'success',
              message: `第${batchNumber}/${batches.length}批处理成功: ${batchResult.message}`,
              time: new Date().toLocaleString()
            })
          } else {
            failedCount += batchCsgList.length
            result.cancelJpSearchLogs.push({
              type: 'error',
              message: `第${batchNumber}/${batches.length}批处理失败: ${batchResult.message}`,
              time: new Date().toLocaleString()
            })
          }
          
          // 添加短暂延迟避免频繁请求
          if (i < batches.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
        
        // 设置总体处理结果
        const endTime = new Date()
        const processingTime = (endTime - startTime) / 1000 // 秒
        
        if (failedCount === 0) {
          result.success = true
          result.message = `整店取消京配打标成功，共处理${csgList.length}个商品，耗时${processingTime.toFixed(1)}秒`
        } else if (successCount > 0) {
          result.success = true
          result.message = `整店取消京配打标部分成功，成功${successCount}个，失败${failedCount}个，耗时${processingTime.toFixed(1)}秒`
        } else {
          result.success = false
          result.message = `整店取消京配打标失败，所有${csgList.length}个商品处理失败，耗时${processingTime.toFixed(1)}秒`
        }
        
      } else {
        // 商品数量不超过5000，直接处理
        result.cancelJpSearchLogs.push({
          type: 'info',
          message: `商品数量(${csgList.length})不超过5000，直接处理`,
          time: new Date().toLocaleString()
        })
        
        // 直接上传处理
        const uploadResult = await this.uploadCancelJpSearchData(csgList)
        
        // 记录处理结果
        const endTime = new Date()
        const processingTime = (endTime - startTime) / 1000 // 秒
        
        // 根据上传结果设置成功/失败状态
        result.success = uploadResult.success
        result.message = uploadResult.message
        
        result.cancelJpSearchLogs.push({
          type: uploadResult.success ? 'success' : 'error',
          message: result.message,
          time: endTime.toLocaleString(),
          processingTime
        })
      }
      
      // 添加处理结果到结果数组
      result.results.push(result.message)
      
      // 更新任务状态
      if (task) {
        task.状态 = result.success ? '成功' : '失败'
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

      console.log('准备上传Excel文件:', excelFile.name, excelFile.size, 'bytes')

      // 创建FormData
      const formData = new FormData()
      formData.append('csrfToken', csrfToken)
      formData.append('updateShopGoodsJpSearchListFile', excelFile, 'updateShopGoodsJpSearchImportTemplate.xls')

      // 检查FormData内容
      console.log('FormData已创建，包含以下字段:')
      for (const pair of formData.entries()) {
        console.log(
          pair[0],
          ':',
          pair[1] instanceof File ? `文件对象 (${pair[1].name}, ${pair[1].size} bytes)` : pair[1]
        )
      }

      // 序列化FormData
      const serializedFormData = await this.serializeFormData(formData)

      // 获取包含Cookie的请求头
      const headers = await getRequestHeaders()

      // 发送请求
      console.log('发送取消京配打标请求...')
      const response = await window.api.sendRequest(
        'https://o.jdl.com/shopGoods/importUpdateShopGoodsJpSearch.do?_r=' + Math.random(),
        {
          method: 'POST',
          headers: {
            ...headers,
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
        message: `上传取消京配打标数据失败: ${error.message || '未知错误'}`
      }
    }
  }
}
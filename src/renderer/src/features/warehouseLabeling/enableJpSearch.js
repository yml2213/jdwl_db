import { getAllCookies } from '../../utils/cookieHelper'
import * as XLSX from 'xlsx'
import { getCSGList as getCSGListFromApi } from '../../services/apiService'

export default {
  name: 'enableJpSearch',
  label: '启用京配打标生效',

  /**
   * 执行启用京配打标生效
   * @param {Array} skuList SKU列表
   * @param {Object} task 任务对象
   * @param {Function} createBatchTask 创建批次任务的回调函数
   * @returns {Object} 执行结果
   */
  async execute(skuList, task, createBatchTask) {
    // 初始化日志
    if (!window.importLogs) {
      window.importLogs = []
    }

    // 初始化返回结果
    const result = {
      success: false,
      message: '',
      importLogs: []
    }

    try {
      console.log(`开始处理SKU列表，总数：${skuList.length}`)
      // const startTime = new Date();

      // 记录总SKU数
      result.importLogs.push({
        type: 'info',
        message: `开始处理，总SKU数：${skuList.length}`,
        time: new Date().toLocaleString()
      })

      // 如果SKU数量大于2000，需要分批处理
      if (skuList.length > 2000) {
        // 主任务标记为已分批
        if (task) {
          task.状态 = '已分批'
          task.结果 = [`已将任务分拆为${Math.ceil(skuList.length / 2000)}个批次任务`]
        }

        result.importLogs.push({
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
            选项: task.选项 || { useWarehouse: true }, // 继承原任务选项
            结果: [],
            importLogs: [{
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
            result.importLogs = result.importLogs.concat(batchResult.importLogs)

            // 更新批次任务状态
            batchTask.状态 = batchResult.success ? '成功' : '失败'
            batchTask.结果 = batchResult.results || []
            batchTask.importLogs = batchResult.importLogs

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
    } catch (error) {
      console.error('处理SKU出错:', error)

      result.success = false
      result.message = `处理失败: ${error.message || '未知错误'}`
      result.importLogs.push({
        type: 'error',
        message: `处理失败: ${error.message || '未知错误'}`,
        time: new Date().toLocaleString()
      })

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
      importLogs: [],
      results: []
    }

    try {
      // 记录批次开始时间
      const startTime = new Date()

      result.importLogs.push({
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
      const uploadResult = await this.uploadJpSearchData(csgList)

      // 记录处理结果
      const endTime = new Date()
      const processingTime = (endTime - startTime) / 1000 // 秒

      // 根据上传结果设置成功/失败状态
      result.success = uploadResult.success
      result.message = uploadResult.message
      result.results.push(result.message)

      result.importLogs.push({
        type: uploadResult.success ? 'success' : 'error',
        message: result.message,
        time: endTime.toLocaleString(),
        successCount: uploadResult.processedCount || 0,
        failedCount: uploadResult.failedCount || 0,
        processingTime
      })

      // 更新任务状态 - 只使用成功或失败两种状态
      if (task) {
        // 如果服务器返回resultCode为1，就是成功
        task.状态 = uploadResult.success ? '成功' : '失败'
        task.结果 = result.results
        task.importLogs = result.importLogs
      }

      return result
    } catch (error) {
      console.error('处理批次出错:', error)

      result.success = false
      result.message = `批次处理失败: ${error.message || '未知错误'}`
      result.importLogs.push({
        type: 'error',
        message: result.message,
        time: new Date().toLocaleString()
      })
      result.results.push(result.message)

      // 更新任务状态
      if (task) {
        task.状态 = '失败'
        task.结果 = result.results
        task.importLogs = result.importLogs
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
      console.log(`=================csgList enableJpSearch=============================`)
      console.log(result)
      console.log(`=================csgList enableJpSearch end=============================`)

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
   * 上传京配打标数据
   * @param {Array<string>} csgList - CSG列表
   * @returns {Promise<Object>} 上传结果
   */
  async uploadJpSearchData(csgList) {
    try {
      // 记录接收到的CSG批次信息
      console.log(`处理批次CSG数量: ${csgList.length}`)

      // 获取所有cookies并构建cookie字符串
      const cookies = await getAllCookies()
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
      const csrfToken = cookies.find((cookie) => cookie.name === 'csrfToken')?.value

      if (!csrfToken) {
        throw new Error('未获取到csrfToken')
      }

      console.log('获取到cookies:', cookieString ? '已获取' : '未获取')
      console.log(`开始处理当前批次，共${csgList.length}个CSG，${csgList.length > 0 ? `第一个CSG: ${csgList[0]}, 最后一个CSG: ${csgList[csgList.length - 1]}` : '无CSG'}`)

      // 创建Excel数据结构
      const data = this.createExcelData(csgList)

      // 将数据转换为xlsx文件
      const file = await this.convertToExcelFile(data)

      // 创建FormData
      const formData = new FormData()
      formData.append('csrfToken', csrfToken)
      formData.append('updateShopGoodsJpSearchListFile', file)

      // 打印FormData条目
      console.log('FormData条目:')
      for (const pair of formData.entries()) {
        console.log(`  ${pair[0]}: ${pair[1] instanceof File ? pair[1].name : pair[1]}`)
      }

      // 序列化FormData
      const serializedFormData = await this.serializeFormData(formData)

      // 发送请求
      const url = 'https://o.jdl.com/shopGoods/importUpdateShopGoodsJpSearch.do?_r=' + Math.random()
      const response = await window.api.sendRequest(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
          'cache-control': 'no-cache',
          'origin': 'https://o.jdl.com',
          'pragma': 'no-cache',
          'priority': 'u=0, i',
          'referer': 'https://o.jdl.com/goToMainIframe.do',
          'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'iframe',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'Cookie': cookieString
        },
        body: serializedFormData
      })

      console.log('上传京配打标数据响应:', response)

      // 解析响应结果
      if (response && response.resultCode == 1) {
        // 成功响应 - resultCode为1表示成功
        console.log('启用京配打标生效成功==========')

        // 将日志信息添加到window上下文，使UI可以访问
        if (!window.importLogs) {
          window.importLogs = []
        }
        window.importLogs.push({
          timestamp: new Date().toLocaleTimeString(),
          type: 'success',
          batchSize: csgList.length,
          message: `成功处理${csgList.length}个SKU`
        })

        return {
          success: true,
          message: '启用京配打标生效成功',
          processedCount: csgList.length,
          failedCount: 0,
          skippedCount: 0,
          data: response.resultData
        }
      } else {
        // 失败响应
        let errorMessage = response?.resultMessage || response?.message || '启用京配打标生效失败，未知原因'

        console.error('京配打标生效失败:', errorMessage)

        // 将错误信息添加到window上下文，使UI可以访问
        if (!window.importLogs) {
          window.importLogs = []
        }
        window.importLogs.push({
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          batchSize: csgList.length,
          message: errorMessage
        })

        return {
          success: false,
          message: errorMessage,
          processedCount: 0,
          failedCount: csgList.length,
          skippedCount: 0,
          data: response
        }
      }
    } catch (error) {
      console.error('上传京配打标数据失败:', error)
      return {
        success: false,
        message: `上传失败: ${error.message || '未知错误'}`,
        processedCount: 0,
        failedCount: csgList.length,
        skippedCount: 0,
        error
      }
    }
  },

  /**
   * 创建Excel数据结构
   * @param {Array<string>} csgList - CSG列表
   * @returns {Array<Array<any>>} Excel数据
   */
  createExcelData(csgList) {
    console.log(`createExcelData csgList: ${csgList}`)
    // 表头行
    const headers = [
      'CSG编号',
      '京配搜索（0否，1是）'
    ]

    // 数据行
    const rows = csgList.map((csg) => {
      return [
        csg, // CSG编号
        1    // 京配搜索（默认为1-是）
      ]
    })

    // 合并表头和数据行
    return [headers, ...rows]
  },

  /**
   * 将数据转换为Excel文件
   * @param {Array<Array<any>>} data - Excel数据
   * @returns {Promise<File>} Excel文件对象
   */
  async convertToExcelFile(data) {
    try {
      // 生成工作表
      const ws = XLSX.utils.aoa_to_sheet(data)

      // 创建工作簿
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

      // 生成二进制数据 - 使用xls格式
      const excelBinaryData = XLSX.write(wb, {
        bookType: 'xls',
        type: 'binary',
        compression: true,
        bookSST: false
      })

      // 将二进制字符串转换为ArrayBuffer
      const buf = new ArrayBuffer(excelBinaryData.length)
      const view = new Uint8Array(buf)
      for (let i = 0; i < excelBinaryData.length; i++) {
        view[i] = excelBinaryData.charCodeAt(i) & 0xff
      }

      // 创建文件对象
      return new File([buf], 'updateShopGoodsJpSearchImportTemplate.xls', {
        type: 'application/vnd.ms-excel'
      })
    } catch (error) {
      console.error('生成Excel文件失败:', error)
      throw new Error(`生成Excel文件失败: ${error.message}`)
    }
  },

  /**
   * 序列化FormData以便传递给主进程
   * @param {FormData} formData - FormData对象
   * @returns {Promise<Object>} 序列化后的FormData
   */
  async serializeFormData(formData) {
    const entries = []

    // 处理FormData中的每一个条目
    for (const pair of formData.entries()) {
      const [key, value] = pair

      // 如果是文件对象，需要特殊处理
      if (value instanceof File) {
        try {
          // 读取文件内容为ArrayBuffer
          const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsArrayBuffer(value)
          })

          // 转换为Uint8Array，然后转为普通数组以便序列化
          const data = Array.from(new Uint8Array(arrayBuffer))

          // 将文件信息添加到entries
          entries.push([
            key,
            {
              _isFile: true,
              name: value.name,
              type: value.type,
              size: value.size,
              data: data
            }
          ])
        } catch (error) {
          console.error('序列化文件失败:', error)
          throw new Error(`序列化文件失败: ${error.message}`)
        }
      } else {
        // 非文件类型直接添加
        entries.push([key, value])
      }
    }

    // 记录序列化后的条目数
    console.log(`序列化后的FormData条目数: ${entries.length}`)
    entries.forEach(entry => {
      console.log(`  序列化条目: ${entry[0]}, 类型: ${entry[1]._isFile ? '文件' : '普通值'}`)
    })

    // 返回可序列化的对象
    return {
      _isFormData: true,
      entries
    }
  }
}

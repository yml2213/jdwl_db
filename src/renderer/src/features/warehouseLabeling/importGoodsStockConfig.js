import { getSelectedDepartment, getSelectedShop } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'importGoodsStockConfig',
  label: '启用库存商品分配',

  /**
   * 执行仓库商品配置导入
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

      // 获取事业部信息
      const department = getSelectedDepartment()
      if (!department) {
        throw new Error('未选择事业部，无法启用库存商品分配')
      }

      // 实际处理SKU - 调用上传方法
      const uploadResult = await this.uploadGoodsStockConfigData(skuList, department)

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
        failureCount: uploadResult.failedCount || 0,
        processingTime
      })

      // 更新任务状态
      if (task) {
        task.状态 = uploadResult.success ? '成功' : '失败'  // 确保任何失败（包括时间限制）都标记为失败
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
   * 上传商品库存配置数据到服务器
   * @param {Array<string>} skuList - 当前批次的SKU列表
   * @param {Object} department - 事业部信息
   * @returns {Promise<Object>} 上传结果
   */
  async uploadGoodsStockConfigData(skuList, department) {
    try {
      // 记录接收到的SKU批次信息
      console.log(`处理批次SKU数量: ${skuList.length}`)

      // 获取所有cookies并构建cookie字符串
      const cookies = await getAllCookies()
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

      console.log('获取到cookies:', cookieString ? '已获取' : '未获取')
      console.log(`开始处理当前批次，共${skuList.length}个SKU，${skuList.length > 0 ? `第一个SKU: ${skuList[0]}, 最后一个SKU: ${skuList[skuList.length - 1]}` : '无SKU'}`)

      // 创建Excel数据结构
      const data = this.createExcelData(skuList, department)

      // 将数据转换为xlsx文件
      const file = await this.convertToExcelFile(data)

      // 创建FormData - 确保参数名称正确
      const formData = new FormData()
      // 根据curl命令使用正确的参数名
      formData.append('goodsStockConfigExcelFile', file)

      // 打印FormData条目
      console.log('FormData条目:')
      for (const pair of formData.entries()) {
        console.log(`  ${pair[0]}: ${pair[1] instanceof File ? pair[1].name : pair[1]}`)
      }

      // 序列化FormData
      const serializedFormData = await this.serializeFormData(formData)

      // 发送请求
      const url = 'https://o.jdl.com/goodsStockConfig/importGoodsStockConfig.do?_r=' + Math.random()
      const response = await window.api.sendRequest(url, {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
          'cache-control': 'no-cache',
          origin: 'https://o.jdl.com',
          pragma: 'no-cache',
          priority: 'u=0, i',
          referer: 'https://o.jdl.com/goToMainIframe.do',
          'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'iframe',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          Cookie: cookieString
        },
        body: serializedFormData
      })

      console.log('上传库存商品分配数据响应:', response)

      // 解析响应结果
      if (response && (response.resultCode === "1" || response.resultCode === "2")) {
        // 成功响应 - resultCode为1或2都表示成功
        // resultCode为2时通常会返回包含导入日志的文件路径

        // 获取日志文件名，方便查看
        let logFileName = "无日志文件"
        if (response.resultCode === "2" && response.resultData && typeof response.resultData === 'string') {
          const parts = response.resultData.split('/')
          logFileName = parts[parts.length - 1] || response.resultData
        }

        console.log(`批次导入成功，状态码: ${response.resultCode}，导入日志: ${logFileName}`)

        // 将日志信息添加到window上下文，使UI可以访问
        if (!window.importLogs) {
          window.importLogs = []
        }
        window.importLogs.push({
          timestamp: new Date().toLocaleTimeString(),
          type: 'success',
          batchSize: skuList.length,
          logFile: logFileName,
          message: `成功导入${skuList.length}个SKU，日志文件: ${logFileName}`
        })

        return {
          success: true,
          message: '启用库存商品分配成功',
          processedCount: skuList.length,
          failedCount: 0,
          skippedCount: 0,
          data: response.resultData,
          logFileName: logFileName
        }
      } else {
        // 失败响应
        let errorMessage = response?.resultMessage || response?.message || '启用库存商品分配失败，未知原因'
        let isTimeLimit = false

        // 如果是5分钟限制的错误，修改错误信息格式
        if (response?.resultMessage?.includes('5分钟内不要频繁操作') || response?.message?.includes('5分钟内不要频繁操作')) {
          errorMessage = '启用库存商品分配: 已失败 - 5分钟内不要频繁操作！'
          isTimeLimit = true
        }

        console.error('库存商品分配导入失败:', errorMessage)

        // 将错误信息添加到window上下文，使UI可以访问
        if (!window.importLogs) {
          window.importLogs = []
        }
        window.importLogs.push({
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          batchSize: skuList.length,
          message: errorMessage
        })

        return {
          success: false,
          message: errorMessage,
          processedCount: 0,
          failedCount: skuList.length,
          skippedCount: 0,
          data: response,
          isTimeLimit: isTimeLimit  // 添加标记以便上层代码知道是时间限制错误
        }
      }
    } catch (error) {
      console.error('上传库存商品分配数据失败:', error)
      return {
        success: false,
        message: `上传失败: ${error.message || '未知错误'}`,
        processedCount: 0,
        failedCount: skuList.length,
        skippedCount: 0,
        error
      }
    }
  },

  /**
   * 创建Excel数据结构
   * @param {Array<string>} skuList - SKU列表
   * @param {Object} department - 事业部信息
   * @returns {Array<Array<any>>} Excel数据
   */
  createExcelData(skuList, department) {
    // 表头行，按照图片要求的顺序排列
    const headers = [
      '事业部编码',
      '主商品编码',
      '商家商品标识',
      '店铺编码',
      '库存管理方式',
      '库存比例/数值',
      '仓库编号'
    ]

    // 动态获取店铺信息
    const shop = getSelectedShop()
    const shopInfo = {
      shopNo: shop?.shopNo || ''  // 使用选择的店铺编码，如果没有则为空字符串
    }

    // 数据行
    const rows = skuList.map((sku) => {
      return [
        department.deptNo, // 事业部编码（CBU开头）
        '', // 主商品编码（CMG开头，设为空）
        sku, // 商家商品标识（SKU）
        shopInfo.shopNo, // 店铺编码（CSP开头）
        1, // 库存管理方式（默认为1-独占）
        100, // 库存比例/数值（默认为100）
        '' // 仓库编号（设为空）
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
      // 直接使用导入的XLSX
      // 生成工作表
      const ws = XLSX.utils.aoa_to_sheet(data)

      // 创建工作簿
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'GoodsStockConfig')

      // 生成二进制数据 - 使用xlsx格式而不是xls
      const excelBinaryData = XLSX.write(wb, {
        bookType: 'xlsx',
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

      // 创建文件对象 - 使用标准化的文件名和MIME类型
      return new File([buf], 'goodsStockConfigTemplate.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
  },

  /**
   * 处理导入结果
   * @returns {Promise<Object>} 处理结果
   */
  async handleResult() {
    // 启用库存商品分配功能结果已经在execute方法中完成，不需要额外处理
    return null
  }
} 
import { getSelectedDepartment } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'importLogisticsProps',
  label: '导入物流属性',

  /**
   * 执行导入物流属性功能
   * @param {Array<string>} skuList - SKU列表
   * @returns {Promise<Object>} 执行结果
   */
  async execute(skuList) {
    console.log('执行[导入物流属性]功能，SKU列表:', skuList)

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      throw new Error('未选择事业部，无法导入物流属性')
    }

    try {
      // 构建表格数据，每批最多处理500个SKU
      const BATCH_SIZE = 500
      let processedCount = 0
      let failedCount = 0
      let totalBatches = Math.ceil(skuList.length / BATCH_SIZE)

      console.log(`SKU总数: ${skuList.length}, 分成 ${totalBatches} 批处理`)

      // 每批处理
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE
        const endIdx = Math.min(startIdx + BATCH_SIZE, skuList.length)
        const batchSkus = skuList.slice(startIdx, endIdx)

        console.log(`处理第 ${batchIndex + 1}/${totalBatches} 批, 包含 ${batchSkus.length} 个SKU`)

        try {
          // 调用API上传物流属性数据
          const result = await this.uploadLogisticsData(batchSkus, department)

          if (result.success) {
            processedCount += batchSkus.length
            console.log(`批次 ${batchIndex + 1} 处理成功`)
          } else {
            failedCount += batchSkus.length
            console.error(`批次 ${batchIndex + 1} 处理失败: ${result.message}`)
          }

          // 每批之间等待至少5分钟
          if (batchIndex < totalBatches - 1) {
            const waitTime = 5 * 60 * 1000 // 5分钟
            console.log(`等待${waitTime / 1000}秒后处理下一批...`)
            await new Promise((resolve) => setTimeout(resolve, waitTime))
          }
        } catch (error) {
          console.error(`批次 ${batchIndex + 1} 处理出错:`, error)
          failedCount += batchSkus.length
        }
      }

      return {
        success: failedCount === 0,
        message: `导入物流属性完成: 成功 ${processedCount} 个, 失败 ${failedCount} 个`,
        processedCount,
        failedCount,
        skippedCount: 0
      }
    } catch (error) {
      console.error('导入物流属性失败:', error)
      return {
        success: false,
        message: `导入物流属性失败: ${error.message || '未知错误'}`,
        processedCount: 0,
        failedCount: skuList.length,
        skippedCount: 0
      }
    }
  },

  /**
   * 上传物流属性数据到服务器
   * @param {Array<string>} skuList - 当前批次的SKU列表
   * @param {Object} department - 事业部信息
   * @returns {Promise<Object>} 上传结果
   */
  async uploadLogisticsData(skuList, department) {
    try {
      // 获取所有cookies并构建cookie字符串
      const cookies = await getAllCookies()
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

      console.log('获取到cookies:', cookieString ? '已获取' : '未获取')

      // 创建Excel数据结构
      const data = this.createExcelData(skuList, department)

      // 将数据转换为xls文件
      const file = await this.convertToExcelFile(data)

      // 创建FormData
      const formData = new FormData()
      formData.append('importAttributeFile', file)

      // 序列化FormData
      const serializedFormData = await this.serializeFormData(formData)

      // 发送请求
      const url = 'https://o.jdl.com/goods/doImportGoodsLogistics.do?_r=' + Math.random()
      const response = await window.api.sendRequest(url, {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
          'cache-control': 'no-cache',
          'content-type': 'multipart/form-data',
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

      console.log('上传物流属性响应:', response)

      // 正确解析响应结果
      if (
        response &&
        (response.success === true || (response.data && response.data.includes('导入成功')))
      ) {
        // 成功响应
        const taskId = (response.data && response.data.match(/任务编号:([^,]+)/)?.[1]) || '未知'
        return {
          success: true,
          message: response.data || '导入成功',
          taskId: taskId,
          processedCount: skuList.length,
          failedCount: 0,
          skippedCount: 0,
          data: response
        }
      } else {
        // 失败响应
        return {
          success: false,
          message: response?.tipMsg || response?.data || '导入失败，未知原因',
          processedCount: 0,
          failedCount: skuList.length,
          skippedCount: 0,
          data: response
        }
      }
    } catch (error) {
      console.error('上传物流属性失败:', error)
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
    // 表头行
    const headers = [
      '事业部商品编码',
      '事业部编码',
      '商家商品编号',
      '长(mm)',
      '宽(mm)',
      '高(mm)',
      '净重(kg)',
      '毛重(kg)'
    ]

    // 数据行
    const rows = skuList.map((sku) => {
      return [
        '', // 事业部商品编码（空白）
        department.deptNo, // 事业部编码
        sku, // 商家商品编号（SKU）
        120, // 长(mm) - 默认值，可通过UI自定义
        60, // 宽(mm) - 默认值，可通过UI自定义
        60, // 高(mm) - 默认值，可通过UI自定义
        '', // 净重(kg) - 默认空白
        0.1 // 毛重(kg) - 默认值，可通过UI自定义
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
      XLSX.utils.book_append_sheet(wb, ws, 'GoodsLogistics')

      // 生成二进制数据
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
      return new File([buf], 'GoodsLogisticsTemplate.xls', {
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
    // 导入物流属性功能结果已经在execute方法中完成，不需要额外处理
    return null
  }
}

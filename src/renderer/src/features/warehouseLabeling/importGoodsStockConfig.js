import { getSelectedDepartment } from '../../utils/storageHelper'
import * as XLSX from 'xlsx'
import { getAllCookies } from '../../utils/cookieHelper'

export default {
  name: 'importGoodsStockConfig',
  label: '启用库存商品分配',

  /**
   * 执行启用库存商品分配功能
   * @param {Array<string>} skuList - SKU列表
   * @returns {Promise<Object>} 执行结果
   */
  async execute(skuList) {
    console.log('执行[启用库存商品分配]功能，SKU列表:', skuList)

    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      throw new Error('未选择事业部，无法启用库存商品分配')
    }

    try {
      // 构建表格数据，每批最多处理2000个SKU
      const BATCH_SIZE = 2000
      let processedCount = 0
      let failedCount = 0
      let totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
      // 收集失败的错误信息
      const failedResults = []
      // 需要重试的批次
      const retryBatches = [];

      console.log(`SKU总数: ${skuList.length}, 分成 ${totalBatches} 批处理`)

      // 每批处理
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE
        const endIdx = Math.min(startIdx + BATCH_SIZE, skuList.length)
        const batchSkus = skuList.slice(startIdx, endIdx)

        console.log(`处理第 ${batchIndex + 1}/${totalBatches} 批, 包含 ${batchSkus.length} 个SKU`)

        try {
          // 调用API上传商品主数据
          const result = await this.uploadGoodsStockConfigData(batchSkus, department)

          if (result.success) {
            processedCount += batchSkus.length
            console.log(`批次 ${batchIndex + 1} 处理成功`)
          } else {
            // 如果是频繁操作的错误，将批次加入重试队列
            if (result.errorType === 'frequent_operation') {
              console.log(`批次 ${batchIndex + 1} 因频繁操作限制而失败，将加入重试队列`);
              retryBatches.push({
                batchIndex,
                skus: batchSkus,
                retryCount: 0
              });
              // 在这种情况下不立即计入失败数，等待重试
              console.log(`批次 ${batchIndex + 1} 将在其他批次处理后重试`);
            } else {
              // 其他类型的错误，直接计入失败
              failedCount += batchSkus.length;
              // 添加失败原因到收集器
              if (result.data) {
                failedResults.push(result.data)
              } else if (result.message) {
                failedResults.push(result.message)
              } else {
                failedResults.push(`批次 ${batchIndex + 1} 处理失败`)
              }
              console.error(`批次 ${batchIndex + 1} 处理失败: ${result.message}`)
            }
          }

          // 每批之间等待，避免频繁操作错误
          if (batchIndex < totalBatches - 1) {
            const waitTime = 5 * 60 * 1000 // 5分钟
            console.log(`等待${waitTime / 1000}秒后处理下一批...`)
            
            // 定期输出等待状态，避免UI看起来像卡住
            const startTime = Date.now();
            const endTime = startTime + waitTime;
            
            // 每30秒输出一次等待状态
            while (Date.now() < endTime) {
              const remainingTime = Math.ceil((endTime - Date.now()) / 1000);
              console.log(`等待下一批处理，剩余${remainingTime}秒...`);
              await new Promise(resolve => setTimeout(resolve, 30000)); // 每30秒更新一次
            }
          }
        } catch (error) {
          console.error(`批次 ${batchIndex + 1} 处理出错:`, error)
          failedCount += batchSkus.length
          // 添加错误消息到收集器
          failedResults.push(error.message || `批次 ${batchIndex + 1} 出现未知错误`)
        }
      }
      
      // 处理需要重试的批次
      if (retryBatches.length > 0) {
        console.log(`开始处理${retryBatches.length}个需要重试的批次`);
        
        // 对每个需要重试的批次进行处理
        for (let i = 0; i < retryBatches.length; i++) {
          const retryItem = retryBatches[i];
          const maxRetries = 3;
          
          console.log(`重试批次 ${retryItem.batchIndex + 1}/${totalBatches}, 第${retryItem.retryCount + 1}/${maxRetries}次尝试`);
          
          // 等待较长时间再重试
          const retryWaitTime = 10 * 60 * 1000; // 10分钟
          console.log(`等待${retryWaitTime / 1000}秒后重试...`);
          
          // 定期输出等待状态
          const startTime = Date.now();
          const endTime = startTime + retryWaitTime;
          
          // 每30秒输出一次等待状态
          while (Date.now() < endTime) {
            const remainingTime = Math.ceil((endTime - Date.now()) / 1000);
            console.log(`等待重试批次${retryItem.batchIndex + 1}，剩余${remainingTime}秒...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
          
          try {
            // 重试上传
            const result = await this.uploadGoodsStockConfigData(retryItem.skus, department);
            
            if (result.success) {
              processedCount += retryItem.skus.length;
              console.log(`重试批次 ${retryItem.batchIndex + 1} 处理成功`);
            } else {
              // 重试仍然失败
              retryItem.retryCount++;
              
              // 如果还有重试次数且仍然是频繁操作错误，将再次添加到重试队列
              if (retryItem.retryCount < maxRetries && result.errorType === 'frequent_operation') {
                console.log(`批次 ${retryItem.batchIndex + 1} 重试失败，将进行第${retryItem.retryCount + 1}次重试`);
                // 将该批次重新加入队列末尾
                retryBatches.push(retryItem);
              } else {
                // 超过最大重试次数或不是频繁操作错误，计为失败
                failedCount += retryItem.skus.length;
                failedResults.push(result.message || `批次 ${retryItem.batchIndex + 1} 重试${retryItem.retryCount}次后仍失败`);
                console.error(`批次 ${retryItem.batchIndex + 1} 在${retryItem.retryCount}次重试后仍失败: ${result.message}`);
              }
            }
          } catch (error) {
            console.error(`重试批次 ${retryItem.batchIndex + 1} 处理出错:`, error);
            failedCount += retryItem.skus.length;
            failedResults.push(error.message || `批次 ${retryItem.batchIndex + 1} 重试出现未知错误`);
          }
        }
      }

      return {
        success: failedCount === 0,
        message: `启用库存商品分配完成: 成功 ${processedCount} 个, 失败 ${failedCount} 个`,
        processedCount,
        failedCount,
        skippedCount: 0,
        errorDetail: failedResults.length > 0 ? failedResults.join('; ') : null
      }
    } catch (error) {
      console.error('启用库存商品分配失败:', error)
      return {
        success: false,
        message: `启用库存商品分配失败: ${error.message || '未知错误'}`,
        processedCount: 0,
        failedCount: skuList.length,
        skippedCount: 0,
        errorDetail: error.message
      }
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
      // 获取所有cookies并构建cookie字符串
      const cookies = await getAllCookies()
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

      console.log('获取到cookies:', cookieString ? '已获取' : '未获取')

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

      // 最大重试次数及等待时间配置
      const MAX_RETRIES = 3
      let retryCount = 0
      let response = null

      // 添加重试逻辑
      while (retryCount <= MAX_RETRIES) {
        // 发送请求
        const url = 'https://o.jdl.com/goodsStockConfig/importGoodsStockConfig.do?_r=' + Math.random()
        response = await window.api.sendRequest(url, {
          method: 'POST',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
            'cache-control': 'no-cache',
            // 不手动设置content-type，让FormData自动设置
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

        // 检查是否是频繁操作的错误
        const isFrequentOperationError = 
          response && 
          response.resultCode === "0" && 
          response.resultMessage && 
          (response.resultMessage.includes('5分钟内不要频繁操作') || 
           response.resultMessage.includes('请稍后再试'));

        // 如果是频繁操作错误且未达到最大重试次数，等待后重试
        if (isFrequentOperationError && retryCount < MAX_RETRIES) {
          retryCount++;
          // 计算等待时间：第一次5分钟，之后递增
          const waitTimeMs = (5 + retryCount) * 60 * 1000; 
          console.log(`收到频繁操作限制响应，第${retryCount}次重试，等待${waitTimeMs/1000}秒后重试...`);
          
          // 定期输出等待剩余时间，避免UI看起来像卡住
          const startTime = Date.now();
          const endTime = startTime + waitTimeMs;
          
          // 每30秒输出一次等待状态
          while (Date.now() < endTime) {
            const remainingTime = Math.ceil((endTime - Date.now()) / 1000);
            console.log(`等待重试中，剩余${remainingTime}秒...`);
            await new Promise(resolve => setTimeout(resolve, 30000)); // 每30秒更新一次
          }
          
          // 重新准备请求数据
          console.log('准备重试请求...');
          continue;
        }
        
        // 其他情况，跳出循环处理结果
        break;
      }

      // 解析响应结果
      if (response && response.resultCode === "1") {
        // 成功响应
        return {
          success: true,
          message: '启用库存商品分配成功',
          processedCount: skuList.length,
          failedCount: 0,
          skippedCount: 0,
          data: response.resultData
        }
      } else {
        // 检查是否是频繁操作的错误
        const isFrequentOperationError = 
          response && 
          response.resultCode === "0" && 
          response.resultMessage && 
          (response.resultMessage.includes('5分钟内不要频繁操作') || 
           response.resultMessage.includes('请稍后再试'));

        // 失败响应
        let errorMessage = '启用库存商品分配失败，未知原因';
        let errorType = 'general'; // 一般错误

        if (response) {
          if (response.resultMessage) {
            errorMessage = response.resultMessage;
          } else if (response.resultData) {
            errorMessage = response.resultData;
          } else if (response.tipMsg) {
            errorMessage = response.tipMsg;
          } else if (response.message) {
            errorMessage = response.message;
          }
          
          // 标记频繁操作错误类型
          if (isFrequentOperationError) {
            errorType = 'frequent_operation';
          }
        }

        console.error('库存商品分配导入失败:', errorMessage);

        return {
          success: false,
          message: errorMessage,
          processedCount: 0,
          failedCount: skuList.length,
          skippedCount: 0,
          data: errorMessage,
          errorType: errorType, // 添加错误类型
          originalResponse: response
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

    // 获取店铺编码
    const shopInfo = {
      shopNo: 'CSP00200004055971' // 默认店铺编码，实际应该从store中获取
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
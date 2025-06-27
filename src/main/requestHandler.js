import axios from 'axios'
import { app, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { ipcMain } from 'electron'
import XLSX from 'xlsx'
import qs from 'qs'

// 日志文件路径
const logPath = path.join(app.getPath('userData'), 'request-logs.txt')

/**
 * 记录请求日志
 * @param {string} message - 日志消息
 */
async function logRequest(message) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}\n`

  try {
    await fs.promises.appendFile(logPath, logMessage)
  } catch (error) {
    console.error('写入请求日志失败:', error)
  }
}

// 创建axios实例
const axiosInstance = axios.create({
  timeout: 120000, // 修改为120秒超时，以处理大文件上传
  validateStatus: (status) => status >= 200 && status < 300, // 定义有效的状态码
  maxContentLength: 100 * 1024 * 1024, // 100MB的最大请求内容限制
  maxBodyLength: 100 * 1024 * 1024 // 100MB的最大请求体限制
})

/**
 * 发送HTTP请求
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
async function sendRequest(url, options = {}) {
  try {
    // 记录请求信息
    await logRequest(`发送请求: ${url}, 方法: ${options.method || 'GET'}`)

    // 记录更详细的请求信息
    console.log(
      '完整请求选项:',
      JSON.stringify(
        {
          url,
          method: options.method,
          headers: options.headers,
          hasBody: !!options.body
        },
        null,
        2
      )
    )

    // 将fetch风格的options转换为axios接受的格式
    const axiosOptions = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 120000, // 使用传入的超时或默认120秒
      withCredentials: true, // 确保跨域请求发送cookie
      maxContentLength: 100 * 1024 * 1024, // 100MB限制
      maxBodyLength: 100 * 1024 * 1024 // 100MB限制
    }

    // 处理URL查询参数
    if (options.params) {
      axiosOptions.params = options.params
    }

    // 处理响应类型
    if (options.responseType) {
      axiosOptions.responseType = options.responseType
    }

    // 处理请求体
    if (options.body) {
      if (options.useFormData && options.body.filePath) {
        console.log('处理文件上传请求，文件路径:', options.body.filePath)
        const FormData = require('form-data')
        const formData = new FormData()

        // 添加其他表单字段
        if (options.body.formFields) {
          for (const [key, value] of Object.entries(options.body.formFields)) {
            formData.append(key, value)
          }
        }

        // 附加文件
        formData.append(
          options.body.fileUploadKey,
          fs.createReadStream(options.body.filePath),
          { filename: options.body.fileName }
        )

        axiosOptions.data = formData
        axiosOptions.headers = {
          ...axiosOptions.headers,
          ...formData.getHeaders()
        }
      } else if (options.body instanceof Object && options.body._isFormData) {
        // 对于FormData类型的请求，需要特殊处理
        console.log('处理FormData请求')

        // 创建Node.js的FormData对象
        const FormData = require('form-data')
        const formData = new FormData()

        // 从传入的序列化FormData中获取entries数组
        const { entries } = options.body
        console.log('FormData entries类型:', typeof entries)

        if (Array.isArray(entries)) {
          // 处理数组格式的entries
          console.log('处理数组格式的FormData entries, 长度:', entries.length)

          for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2) {
              console.error('无效的FormData entry格式:', entry)
              continue
            }

            const [key, value] = entry

            // 检查是否是文件对象
            if (value && typeof value === 'object' && value._isFile) {
              // 处理文件：从数组数据中创建buffer
              const fileBuffer = Buffer.from(value.data)
              formData.append(key, fileBuffer, {
                filename: value.name,
                contentType: value.type || 'application/octet-stream'
              })
              console.log(
                `添加文件到FormData: ${key}, 文件名: ${value.name}, 大小: ${fileBuffer.length} bytes`
              )
            } else {
              // 处理普通字段
              formData.append(key, value)
              console.log(`添加字段到FormData: ${key}, 值: ${value}`)
            }
          }
        } else if (typeof entries === 'object') {
          // 处理对象格式的entries
          console.log('处理对象格式的FormData entries')

          for (const [key, value] of Object.entries(entries)) {
            // 检查是否是文件对象
            if (value && typeof value === 'object' && value._isFile) {
              // 处理文件：从数组数据中创建buffer
              const fileBuffer = Buffer.from(value.data)
              formData.append(key, fileBuffer, {
                filename: value.name,
                contentType: value.type || 'application/octet-stream'
              })
              console.log(
                `添加文件到FormData: ${key}, 文件名: ${value.name}, 大小: ${fileBuffer.length} bytes`
              )
            } else {
              // 处理普通字段
              formData.append(key, value)
              console.log(`添加字段到FormData: ${key}, 值: ${value}`)
            }
          }
        } else {
          throw new Error('不支持的FormData格式')
        }

        // 使用FormData的getHeaders方法获取正确的headers
        const formHeaders = formData.getHeaders()
        axiosOptions.headers = {
          ...axiosOptions.headers,
          ...formHeaders
        }

        // 设置数据为FormData
        axiosOptions.data = formData
        console.log('FormData已准备好发送，headers:', formHeaders)
      } else if (typeof options.body === 'string') {
        try {
          // 尝试解析JSON字符串
          axiosOptions.data = JSON.parse(options.body)
        } catch {
          // 如果解析失败，使用原始字符串
          axiosOptions.data = options.body
        }
      } else {
        axiosOptions.data = options.body
      }
    }

    // 使用axios发送请求
    const response = await axiosInstance(axiosOptions)

    console.log('响应状态:', response.status)
    console.log('响应数据:', response.data)

    // 根据响应类型决定如何处理响应
    let result
    if (options.responseType === 'blob') {
      // 对于blob响应，直接返回blob对象
      result = response.data
    } else {
      // 对于其他类型，返回axios解析后的数据
      result = response.data
    }

    // 记录成功响应
    await logRequest(`请求成功: ${url}, 状态: ${response.status}`)

    return result
  } catch (error) {
    // 记录错误
    let errorMessage = ''

    if (error.response) {
      // 服务器返回了错误状态码
      errorMessage = `请求失败: ${url}, 状态码: ${error.response.status}, 错误: ${JSON.stringify(error.response.data)}`
    } else if (error.request) {
      // 请求已发送但未收到响应
      errorMessage = `请求未收到响应: ${url}, 错误: 请求超时或网络问题`
    } else {
      // 请求设置过程中发生错误
      errorMessage = `请求设置错误: ${url}, 错误: ${error.message}`
    }

    await logRequest(errorMessage)
    console.error(errorMessage)

    // 重新抛出错误
    throw (
      error.response?.data || {
        message: error.message,
        status: error.response?.status || 500
      }
    )
  }
}

async function getCsrfTokenFromCookies(cookies) {
  const tokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
  return tokenCookie ? tokenCookie.value : ''
}

/**
 * 设置所有主进程的IPC事件处理器
 */
export function setupRequestHandlers() {
  console.log('设置主进程IPC事件处理器...')

  ipcMain.on('send-request', async (event, payload) => {
    const { url, options } = payload
    try {
      const result = await sendRequest(url, options)
      event.sender.send('send-request-reply', { success: true, data: result })
    } catch (error) {
      console.error(`[ipcMain] send-request 处理器错误:`, error)
      event.sender.send('send-request-reply', {
        success: false,
        message: error.message || '未知错误',
        status: error.status
      })
    }
  })

  // 使用 on/send 模式替换 handle/invoke，以绕过潜在的克隆错误
  ipcMain.on('import-store-products', async (event, payload) => {
    const { skuList, shopInfo, departmentInfo, cookies } = payload
    try {
      console.log('接收到 import-store-products 请求:', {
        skuCount: skuList.length,
        shopName: shopInfo.shopName
      })

      const result = await processSingleBatch(skuList, shopInfo, departmentInfo, cookies)

      // 将结果发送回渲染器进程
      event.sender.send('import-store-products-reply', { success: true, ...result })
    } catch (error) {
      console.error(`[ipcMain] import-store-products 处理器错误:`, error)
      // 将错误发送回渲染器进程
      event.sender.send('import-store-products-reply', {
        success: false,
        message: error.message || '在主进程中导入商品时发生未知错误'
      })
    }
  })

  /**
   * IPC处理程序：上传取消京配打标的数据。
   * 接收CSG列表，在主进程中创建Excel文件并上传。
   */
  ipcMain.handle('upload-cancel-jp-search-data', async (event, { cookies, csgList, shopInfo }) => {
    try {
      console.log(`主进程接收到 upload-cancel-jp-search-data 请求, CSG数量: ${csgList.length}`)

      // 1. 获取 CSRF Token
      const csrfTokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
      const csrfToken = csrfTokenCookie ? csrfTokenCookie.value : ''
      if (!csrfToken) {
        throw new Error('在主进程中无法获取csrfToken')
      }

      // 2. 创建 Excel 数据 (表头 + 数据行)
      const excelData = [['店铺商品编号（CSG编码）必填', '京配搜索（0否，1是）'], ...csgList.map(csg => [csg, '0'])]

      // 3. 将数据转换为 Buffer
      const ws = XLSX.utils.aoa_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const excelBuffer = XLSX.write(wb, { bookType: 'xls', type: 'buffer' })

      // 4. 使用 FormData 和 fetch 发送请求
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
      const form = new FormData()
      form.append('csrfToken', csrfToken)
      form.append('updateShopGoodsJpSearchListFile', new Blob([excelBuffer]), 'updateShopGoodsJpSearchImportTemplate.xls')

      const url = 'https://o.jdl.com/shopGoods/importUpdateShopGoodsJpSearch.do?_r=' + Math.random()

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Cookie': cookieString,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://o.jdl.com',
          'Referer': 'https://o.jdl.com/goToMainIframe.do',
        },
        body: form
      })

      const responseData = await response.json()
      console.log('主进程 upload-cancel-jp-search-data 响应:', responseData)

      // 5. 返回结果给渲染器进程
      if (responseData && responseData.resultCode === 1) {
        return { success: true, message: responseData.resultMessage || '取消京配打标成功' }
      } else {
        return { success: false, message: responseData.resultMessage || responseData.msg || '取消京配打标失败' }
      }

    } catch (error) {
      console.error('主进程处理 upload-cancel-jp-search-data 出错:', error)
      return { success: false, message: `主进程出错: ${error.message}` }
    }
  })

  /**
   * IPC处理程序：重置商品库存分配比例（整店清零）
   * @description 根据 old.js 文件中的正确逻辑重写
   */
  ipcMain.handle('reset-goods-stock-ratio', async (event, { cookies, shopInfo, departmentInfo }) => {
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const csrfToken = await getCsrfTokenFromCookies(cookies)

    if (!csrfToken) {
      return { success: false, message: '主进程错误: 未能获取csrfToken' }
    }

    // 从 old.js 确认，参数是 shopId 和 deptId
    const shopId = shopInfo.id
    const deptId = departmentInfo.id

    if (!shopId || !deptId) {
      return { success: false, message: `主进程错误: 店铺ID或部门ID无效 (shopId: ${shopId}, deptId: ${deptId})` }
    }

    // 根据 old.js 确认，正确的URL、GET方法和查询字符串参数
    const url = `https://o.jdl.com/goodsStockConfig/resetGoodsStockRatio.do?csrfToken=${csrfToken}&shopId=${shopId}&deptId=${deptId}&_r=${Math.random()}`

    try {
      const response = await fetch(url, {
        method: 'GET', // 使用GET方法
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Cookie': cookieString,
          'Referer': 'https://o.jdl.com/goToMainIframe.do',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        }
        // GET请求没有body
      })

      if (!response.ok) {
        return { success: false, message: `服务器请求失败，状态码: ${response.status}.` }
      }

      const result = await response.json()
      console.log('整店清零API响应:', result)

      // 根据 old.js 确认，成功的判断条件
      if (result && (result.resultCode === 1 || result.resultCode === '1' || result.resultMessage === '操作成功！')) {
        return { success: true, message: `成功清空店铺 ${shopInfo.shopName} 的所有SKU库存分配` }
      } else {
        const errorMsg = result?.resultMessage || '未知错误'
        return { success: false, message: errorMsg }
      }
    } catch (error) {
      console.error('主进程处理 reset-goods-stock-ratio 出错:', error)
      return { success: false, message: `主进程请求失败: ${error.message}` }
    }
  })

  /**
   * IPC处理程序：获取店铺的所有商品信息（CSG和SKU）
   */
  ipcMain.handle('get-shop-goods-list', async (event, shopInfo) => {
    console.log('主进程接收到 get-shop-goods-list 请求, 店铺:', shopInfo.shopName)
    if (!shopInfo || !shopInfo.shopNo) {
      return { success: false, message: '主进程错误: 店铺信息不完整' }
    }

    const url = `https://o.jdl.com/shopGoods/queryShopGoodsList.do?rand=${Math.random()}`

    try {
      const cookies = await event.sender.session.cookies.get({})
      const csrfToken = await getCsrfTokenFromCookies(cookies)
      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

      let allItems = { skus: [], csgs: [] }
      let currentStart = 0
      const pageSize = 100
      let totalRecords = null
      let hasMoreData = true

      while (hasMoreData) {
        console.log(`主进程 get-shop-goods-list: 正在获取分页数据, 起始: ${currentStart}`)
        const aoData = [
          { name: 'sEcho', value: 5 }, { name: 'iColumns', value: 14 },
          { name: 'iDisplayStart', value: currentStart }, { name: 'iDisplayLength', value: pageSize },
          // (rest of aoData can be left as is)
        ];

        const requestParams = {
          csrfToken: csrfToken,
          shopNo: shopInfo.shopNo,
          sellerId: shopInfo.sellerId,
          deptId: shopInfo.deptId,
          jdDeliver: '1',
          status: '1',
          aoData: JSON.stringify(aoData)
        }

        const data = qs.stringify(requestParams)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Origin': 'https://o.jdl.com',
            'Referer': 'https://o.jdl.com/goToMainIframe.do',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          },
          body: data
        })

        if (!response.ok) {
          throw new Error(`服务器返回错误状态: ${response.status}`)
        }

        const responseText = await response.text()
        try {
          const responseData = JSON.parse(responseText)
          if (responseData && responseData.aaData) {
            if (totalRecords === null) {
              totalRecords = responseData.iTotalRecords || 0
              console.log(`主进程 get-shop-goods-list: 商品总数: ${totalRecords}`)
            }

            responseData.aaData.forEach(item => {
              if (item.sellerGoodsSign) allItems.skus.push(item.sellerGoodsSign)
              if (item.shopGoodsNo) allItems.csgs.push(item.shopGoodsNo)
            });

            currentStart += responseData.aaData.length
            hasMoreData = currentStart < totalRecords && responseData.aaData.length > 0

            console.log(`主进程 get-shop-goods-list: 已获取 ${currentStart}/${totalRecords}`)

            if (hasMoreData) {
              await new Promise(resolve => setTimeout(resolve, 300)); // 短暂延时
            }

          } else {
            hasMoreData = false
          }
        } catch (e) {
          console.error('JSON解析失败:', e)
          console.error('收到的非JSON响应:', responseText)
          throw new Error(`服务器返回了非预期的响应。`)
        }
      }

      console.log(`主进程获取完成，SKUs: ${allItems.skus.length}, CSGs: ${allItems.csgs.length}`)
      return { success: true, skuList: allItems.skus, csgList: allItems.csgs }

    } catch (error) {
      console.error('主进程处理 get-shop-goods-list 出错:', error)
      return { success: false, message: `主进程出错: ${error.message}` }
    }
  })

  // 导入物流属性
  ipcMain.on('import-logistics-properties', async (event, payload) => {
    const { skuList, departmentInfo, cookies } = payload
    try {
      console.log('接收到 import-logistics-properties 请求:', {
        skuCount: skuList.length
      })
      const result = await processLogisticsProperties(skuList, departmentInfo, cookies, (log) => {
        // 将子函数的日志发送回渲染器进程
        event.sender.send('import-logistics-properties-log', log)
      })
      event.sender.send('import-logistics-properties-reply', { success: true, ...result })
    } catch (error) {
      console.error('[ipcMain] import-logistics-properties 处理器错误:', error)
      event.sender.send('import-logistics-properties-reply', {
        success: false,
        message: error.message || '在主进程中导入物流属性时发生未知错误'
      })
    }
  })

  console.log('主进程IPC事件处理器设置完毕。')
}

/**
 * 处理单个批次的商品导入
 * (这是从 importStoreProducts.js 迁移过来的核心逻辑)
 */
async function processSingleBatch(skuList, storeInfo, department, cookies) {
  const spShopNo = storeInfo.spShopNo
  const importUrl = `https://o.jdl.com/shopGoods/importPopSG.do?spShopNo=${spShopNo}&_r=${Math.random()}`
  console.log('导入接口URL:', importUrl)

  // 不再从主进程session获取，直接使用传递过来的cookies
  const csrfToken = await getCsrfTokenFromCookies(cookies)

  if (!csrfToken) {
    return { success: false, message: '无法从传递的cookies中获取csrfToken' }
  }

  const excelData = [
    ['商家商品编号', '商品名称', '事业部商品编码'],
    ...skuList.map((sku) => [sku, `商品-${sku}`, department.deptNo])
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  const buffer = XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })

  // 将文件保存到临时目录
  const tempDir = app.getPath('temp')
  const fileName = `PopGoodsImportTemplate-${Date.now()}.xls`
  const filePath = path.join(tempDir, fileName)
  await fs.promises.writeFile(filePath, buffer)
  console.log('临时Excel文件已创建:', filePath)

  const payload = {
    csrfToken,
    filePath,
    fileName,
    formFields: {
      csrfToken: csrfToken
    },
    fileUploadKey: 'shopGoodsPopGoodsListFile'
  }

  // 将 cookies 数组转换为单个字符串
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  try {
    const response = await sendRequest(importUrl, {
      method: 'POST',
      headers: {
        Referer: `https://o.jdl.com/shopGoods/showImportPopSG.do?spShopNo=${spShopNo}&deptId=${storeInfo.deptId}`,
        'Cookie': cookieString
      },
      body: payload,
      useFormData: true
    })

    console.log(`批量处理响应:`, response)

    if (response && response.result) {
      return { success: true, message: response.msg }
    }

    return { success: false, message: response.msg || '导入失败，未知原因' }
  } catch (error) {
    console.error(`批量处理请求失败:`, error)
    return { success: false, message: `请求失败: ${error.message}` }
  } finally {
    // 清理临时文件
    await fs.promises.unlink(filePath).catch(err => console.error('删除临时文件失败:', err));
  }
}

// --- 物流属性导入相关函数 (从 importLogisticsProperties.js 迁移) ---

/**
 * 处理物流属性导入的核心逻辑
 */
async function processLogisticsProperties(skuList, department, cookies, logCallback) {
  const BATCH_SIZE = 2000
  let processedCount = 0
  let failedCount = 0
  let totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
  const failedResults = []

  logCallback(`SKU总数: ${skuList.length}, 将分成 ${totalBatches} 批进行处理。`)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE
    const endIdx = Math.min(startIdx + BATCH_SIZE, skuList.length)
    const batchSkus = skuList.slice(startIdx, endIdx)

    logCallback(`正在处理第 ${batchIndex + 1}/${totalBatches} 批, 包含 ${batchSkus.length} 个SKU...`)

    try {
      const result = await uploadLogisticsData(batchSkus, department, cookies)

      if (result.success) {
        processedCount += batchSkus.length
        logCallback(`批次 ${batchIndex + 1} 处理成功。`)
      } else {
        failedCount += batchSkus.length
        const errorMessage = result.data || result.message || `批次 ${batchIndex + 1} 处理失败`
        failedResults.push(errorMessage)
        logCallback(`批次 ${batchIndex + 1} 处理失败: ${errorMessage}`)

        if (errorMessage.includes('5分钟内只能导入一次')) {
          logCallback('检测到API频率限制，导入流程已中断。')
          break
        }
      }

      if (batchIndex < totalBatches - 1) {
        const waitTime = 5 * 60 * 1000 + 5000 // 5分钟 + 5秒缓冲
        logCallback(`批次处理完毕，将等待5分钟后继续...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    } catch (error) {
      logCallback(`批次 ${batchIndex + 1} 处理时发生严重错误: ${error.message}`)
      failedCount += batchSkus.length
      failedResults.push(error.message || `批次 ${batchIndex + 1} 出现未知错误`)
    }
  }

  const isPartialSuccess = processedCount > 0 && failedCount > 0
  const finalMessage = `导入物流属性完成: 成功 ${processedCount}个, 失败 ${failedCount}个。`
  logCallback(finalMessage)

  return {
    success: failedCount === 0,
    message: finalMessage,
    errorDetail: failedResults.length > 0 ? failedResults.join('; ') : null,
    isPartialSuccess
  }
}

/**
 * 上传单批物流属性数据
 */
async function uploadLogisticsData(skuList, department, cookies) {
  const excelBuffer = createLogisticsExcelBuffer(skuList, department)

  // 将Buffer保存到临时文件以便上传
  const tempDir = app.getPath('temp')
  const fileName = `LogisticsImport-${Date.now()}.xls`
  const filePath = path.join(tempDir, fileName)
  await fs.promises.writeFile(filePath, excelBuffer)

  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const csrfToken = await getCsrfTokenFromCookies(cookies)

  const payload = {
    filePath,
    fileName,
    formFields: {
      csrfToken: csrfToken
    },
    fileUploadKey: 'importAttributeFile'
  }

  const url = 'https://o.jdl.com/goods/doImportGoodsLogistics.do?_r=' + Math.random()

  try {
    const responseText = await sendRequest(url, {
      method: 'POST',
      headers: {
        'Cookie': cookieString,
        'Referer': 'https://o.jdl.com/goToMainIframe.do',
        'Origin': 'https://o.jdl.com',
      },
      body: payload,
      useFormData: true,
      responseType: 'text' // 明确指定响应类型为文本
    })

    // HTML响应通常表示成功或需要进一步操作
    if (typeof responseText === 'string') {
      if (responseText.includes("导入成功")) {
        const taskIdMatch = responseText.match(/任务编号:([^,]+)/)
        const taskId = taskIdMatch ? taskIdMatch[1] : '未知'
        return { success: true, message: `导入成功，任务ID: ${taskId}`, data: responseText }
      }
      if (responseText.includes("5分钟内只能导入一次")) {
        return { success: false, message: "API限制：5分钟内只能导入一次。", data: responseText }
      }
      // 根据返回的HTML内容判断其他可能的失败情况
      return { success: false, message: '导入失败，服务器返回未知HTML页面。', data: responseText }
    }

    // 假设非字符串是JSON或其他对象
    // 如果是JSON对象并且有特定成功标识
    if (typeof responseText === 'object' && responseText.result === true) {
      return { success: true, message: responseText.msg || '导入成功' }
    }

    // 其他所有情况都视为失败
    const errorMsg = responseText?.msg || responseText?.message || '未知错误'
    return { success: false, message: errorMsg, data: responseText }

  } catch (error) {
    console.error('上传物流属性数据失败:', error)
    return { success: false, message: `请求发送失败: ${error.message}` }
  } finally {
    await fs.promises.unlink(filePath).catch(err => console.error('删除物流属性临时文件失败:', err));
  }
}

/**
 * 创建物流属性Excel文件的Buffer
 */
function createLogisticsExcelBuffer(skuList, department) {
  const headers = [
    '事业部商品编码', '是否保健品', '是否易碎品', '是否液体', '是否贵品', '是否温度控制', '温控类型', '最低温度', '最高温度',
    '是否需要SN管理', '是否保质期管理', '保质期(天)', '是否批次管理', '默认收货库位', '商品类别', '存储类型', '是否可退货',
    '是否可换货', '是否可维修', '产品尺寸(长*宽*高)mm', '包装尺寸(长*宽*高)mm', '重量(g)'
  ];
  const data = skuList.map(sku => [
    sku, '否', '否', '否', '否', '否', '', '', '', '否', '是', '1095', '是',
    '', department.deptNo.startsWith('RDC') ? '10' : '20',
    '10', '是', '是', '是', '', '', ''
  ]);
  const excelData = [headers, ...data];
  const worksheet = XLSX.utils.aoa_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' });
}

export { sendRequest }

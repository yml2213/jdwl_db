import axios from 'axios'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import * as XLSX from 'xlsx'
import qs from 'qs'
import { loadCookies } from './loginManager'
import { saveBufferToDownloads } from './fileHandler'

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
      // 检查是否是自定义序列化的FormData
      if (options.body._isFormData) {
        const FormData = require('form-data')
        const formData = new FormData()

        for (const [key, value] of options.body.entries) {
          if (value._isFile) {
            // 是文件，从buffer重建
            formData.append(key, Buffer.from(value.data), {
              filename: value.name,
              contentType: value.type
            })
          } else {
            // 普通字段
            formData.append(key, value)
          }
        }
        axiosOptions.data = formData
        // 更新headers，让axios/form-data库处理Content-Type和boundary
        axiosOptions.headers = {
          ...axiosOptions.headers,
          ...formData.getHeaders()
        }
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

  ipcMain.handle('sendRequest', async (event, url, options) => {
    return await sendRequest(url, options)
  })

  ipcMain.handle('upload-store-products', async (event, { fileBuffer, shopInfo }) => {
    const { spShopNo, deptId } = shopInfo
    const url = `https://o.jdl.com/shopGoods/importPopSG.do?spShopNo=${spShopNo}&_r=${Math.random()}`
    const FormData = require('form-data')
    const MAX_RETRIES = 3
    let attempt = 0

    while (attempt < MAX_RETRIES) {
      attempt++
      try {
        await logRequest(`[IPC] 上传店铺商品文件... (尝试 ${attempt}/${MAX_RETRIES})`)

        const cookies = await loadCookies()
        if (!cookies) throw new Error('无法从主进程加载Cookies，用户可能未登录')

        const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
        const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value
        if (!csrfToken) throw new Error('在加载的Cookies中未找到csrfToken')

        const formData = new FormData()
        formData.append('csrfToken', csrfToken)
        formData.append(
          'shopGoodsPopGoodsListFile',
          Buffer.from(fileBuffer),
          'PopGoodsImportTemplate.xls'
        )

        const response = await axiosInstance.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            Cookie: cookieString,
            Referer: `https://o.jdl.com/shopGoods/showImportPopSG.do?spShopNo=${spShopNo}&deptId=${deptId}`
          }
        })

        const responseText = response.data
        await logRequest(`[IPC] 店铺商品导入响应: ${responseText}`)

        if (typeof responseText === 'string' && responseText.includes('频繁操作')) {
          throw new Error('API_RATE_LIMIT')
        }

        return { success: true, message: `导入完成: ${responseText}` }
      } catch (error) {
        await logRequest(`[IPC] 上传失败 (尝试 ${attempt}): ${error.message}`)
        if (error.message === 'API_RATE_LIMIT' && attempt < MAX_RETRIES) {
          await logRequest(`[IPC] 触发频率限制，将在65秒后重试...`)
          await new Promise((resolve) => setTimeout(resolve, 65000))
          continue
        }
        if (attempt >= MAX_RETRIES) {
          return { success: false, message: `文件上传在达到最大重试次数后失败: ${error.message}` }
        }
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
    return { success: false, message: '文件上传未知错误' }
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
  ipcMain.handle('upload-cancel-jp-search-data', async (event, { cookies, csgList }) => {
    try {
      console.log(`主进程接收到 upload-cancel-jp-search-data 请求, CSG数量: ${csgList.length}`)

      // 1. 获取 CSRF Token
      const csrfTokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
      const csrfToken = csrfTokenCookie ? csrfTokenCookie.value : ''
      if (!csrfToken) {
        throw new Error('在主进程中无法获取csrfToken')
      }

      // 2. 创建 Excel 数据 (表头 + 数据行)
      const excelData = [
        ['店铺商品编号（CSG编码）必填', '京配搜索（0否，1是）'],
        ...csgList.map((csg) => [csg, '0'])
      ]

      // 3. 将数据转换为 Buffer
      const ws = XLSX.utils.aoa_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const excelBuffer = XLSX.write(wb, { bookType: 'xls', type: 'buffer' })

      // 4. 使用 FormData 和 fetch 发送请求
      const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
      const form = new FormData()
      form.append('csrfToken', csrfToken)
      form.append(
        'updateShopGoodsJpSearchListFile',
        new Blob([excelBuffer]),
        'updateShopGoodsJpSearchImportTemplate.xls'
      )

      const url = 'https://o.jdl.com/shopGoods/importUpdateShopGoodsJpSearch.do?_r=' + Math.random()

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: cookieString,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: 'https://o.jdl.com',
          Referer: 'https://o.jdl.com/goToMainIframe.do'
        },
        body: form
      })

      const responseData = await response.json()
      console.log('主进程 upload-cancel-jp-search-data 响应:', responseData)

      // 5. 返回结果给渲染器进程
      if (responseData && responseData.resultCode === 1) {
        return { success: true, message: responseData.resultMessage || '取消京配打标成功' }
      } else {
        return {
          success: false,
          message: responseData.resultMessage || responseData.msg || '取消京配打标失败'
        }
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
  ipcMain.handle(
    'reset-goods-stock-ratio',
    async (event, { cookies, shopInfo, departmentInfo }) => {
      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const csrfToken = await getCsrfTokenFromCookies(cookies)

      if (!csrfToken) {
        return { success: false, message: '主进程错误: 未能获取csrfToken' }
      }

      // 从 old.js 确认，参数是 shopId 和 deptId
      const shopId = shopInfo.id
      const deptId = departmentInfo.id

      if (!shopId || !deptId) {
        return {
          success: false,
          message: `主进程错误: 店铺ID或部门ID无效 (shopId: ${shopId}, deptId: ${deptId})`
        }
      }

      // 根据 old.js 确认，正确的URL、GET方法和查询字符串参数
      const url = `https://o.jdl.com/goodsStockConfig/resetGoodsStockRatio.do?csrfToken=${csrfToken}&shopId=${shopId}&deptId=${deptId}&_r=${Math.random()}`

      try {
        const response = await fetch(url, {
          method: 'GET', // 使用GET方法
          headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Cookie: cookieString,
            Referer: 'https://o.jdl.com/goToMainIframe.do',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
          }
          // GET请求没有body
        })

        if (!response.ok) {
          return { success: false, message: `服务器请求失败，状态码: ${response.status}.` }
        }

        const result = await response.json()
        console.log('整店清零API响应:', result)

        // 根据 old.js 确认，成功的判断条件
        if (
          result &&
          (result.resultCode === 1 ||
            result.resultCode === '1' ||
            result.resultMessage === '操作成功！')
        ) {
          return { success: true, message: `成功清空店铺 ${shopInfo.shopName} 的所有SKU库存分配` }
        } else {
          const errorMsg = result?.resultMessage || '未知错误'
          return { success: false, message: errorMsg }
        }
      } catch (error) {
        console.error('主进程处理 reset-goods-stock-ratio 出错:', error)
        return { success: false, message: `主进程请求失败: ${error.message}` }
      }
    }
  )

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
          { name: 'sEcho', value: 5 },
          { name: 'iColumns', value: 14 },
          { name: 'iDisplayStart', value: currentStart },
          { name: 'iDisplayLength', value: pageSize }
          // (rest of aoData can be left as is)
        ]

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
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Origin: 'https://o.jdl.com',
            Referer: 'https://o.jdl.com/goToMainIframe.do',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookieString,
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
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

            responseData.aaData.forEach((item) => {
              if (item.sellerGoodsSign) allItems.skus.push(item.sellerGoodsSign)
              if (item.shopGoodsNo) allItems.csgs.push(item.shopGoodsNo)
            })

            currentStart += responseData.aaData.length
            hasMoreData = currentStart < totalRecords && responseData.aaData.length > 0

            console.log(`主进程 get-shop-goods-list: 已获取 ${currentStart}/${totalRecords}`)

            if (hasMoreData) {
              await new Promise((resolve) => setTimeout(resolve, 300)) // 短暂延时
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

  // 使用 handle 模式处理从渲染器进程发送的物流属性导入请求
  ipcMain.handle(
    'import-logistics-properties',
    async (event, { skuList, departmentInfo, cookies, logisticsOptions }) => {
      try {
        // 日志回调现在不再需要，因为我们会在完成后一次性返回所有信息
        const logMessages = []
        const logCallback = (message) => {
          logMessages.push(message)
          // 实时日志仍然可以通过一个独立的、非阻塞的事件发送
          event.sender.send('import-logistics-properties-log', message)
        }

        // 注意：processLogisticsProperties 可能会耗时很长
        const result = await processLogisticsProperties(
          skuList,
          departmentInfo,
          cookies,
          logCallback,
          logisticsOptions
        )

        // 在最终结果中附加完整的日志记录
        return { ...result, fullLog: logMessages }
      } catch (error) {
        console.error('[ipcMain] import-logistics-properties 处理器错误:', error)
        // 当使用 handle 时，应该通过抛出错误或返回一个包含错误信息的对象来传递失败状态
        return {
          success: false,
          message: error.message || '在主进程中处理物流属性时发生未知错误'
        }
      }
    }
  )

  ipcMain.handle('upload-jp-search-data', async (event, { fileBuffer }) => {
    const url = `https://o.jdl.com/shopGoods/importUpdateShopGoodsJpSearch.do?_r=${Math.random()}`
    const FormData = require('form-data')

    try {
      await logRequest(`[IPC] 上传京配打标文件...`)

      // (调试功能) 保存一份到用户的下载目录
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const debugFileName = `jp-search-debug-${timestamp}.xlsx`
        await saveBufferToDownloads(fileBuffer, debugFileName)
        logRequest(`[IPC] 京配打标调试文件已保存: ${debugFileName}`)
      } catch (e) {
        console.error('无法保存用于调试的京配打标文件:', e)
      }

      const cookies = await loadCookies()
      if (!cookies) throw new Error('无法从主进程加载Cookies，用户可能未登录')

      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const csrfToken = cookies.find((c) => c.name === 'csrfToken')?.value
      if (!csrfToken) throw new Error('在加载的Cookies中未找到csrfToken')

      const formData = new FormData()
      formData.append('csrfToken', csrfToken)
      formData.append(
        'updateShopGoodsJpSearchListFile',
        Buffer.from(fileBuffer),
        'updateShopGoodsJpSearchImportTemplate.xls'
      )

      const response = await axiosInstance.post(url, formData, {
        headers: {
          ...formData.getHeaders(),
          Cookie: cookieString,
          Referer: 'https://o.jdl.com/goToMainIframe.do',
          Accept: 'application/json, text/javascript, */*; q=0.01'
        }
      })

      const responseData = response.data
      console.log('京配打标导入响应:', responseData)
      await logRequest(`[IPC] 京配打标导入响应: ${JSON.stringify(responseData)}`)

      // 优先处理JSON响应
      if (typeof responseData === 'object' && responseData !== null) {
        if (responseData.resultCode === 1 || responseData.resultCode === '1') {
          return { success: true, message: responseData.resultMessage || '京配打标文件上传成功' }
        } else {
          return {
            success: false,
            message: responseData.resultMessage || responseData.msg || '京配打标文件上传失败'
          }
        }
      }

      // 兼容HTML响应
      if (typeof responseData === 'string' && responseData.includes('导入成功')) {
        return { success: true, message: '京配打标文件上传成功' }
      } else if (typeof responseData === 'string') {
        const match = responseData.match(/<div class="error-msg">(.*?)<\/div>/)
        const errorMessage = match ? match[1].trim() : '京配打标文件上传失败'
        return { success: false, message: errorMessage }
      }

      return { success: false, message: '服务器返回了未知格式的响应。' }
    } catch (error) {
      await logRequest(`[IPC] 京配打标上传失败: ${error.message}`)
      return { success: false, message: `上传失败: ${error.message}` }
    }
  })

  ipcMain.handle('upload-goods-stock-config', async (event, { fileBuffer, cookies }) => {
    const url = `https://o.jdl.com/goodsStockConfig/importGoodsStockConfig.do?_r=${Math.random()}`
    const FormData = require('form-data')

    const sendLog = (message, type = 'info') => {
      event.sender.send('ipc-log', { message: `[IPC] ${message}`, type })
    }

    try {
      sendLog(`上传库存商品分配文件...`)

      if (!cookies || cookies.length === 0) throw new Error('从渲染器进程接收到的Cookies为空')
      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

      const formData = new FormData()
      formData.append(
        'goodsStockConfigExcelFile',
        Buffer.from(fileBuffer),
        'goodsStockConfigTemplate.xlsx'
      )

      const response = await axiosInstance.post(url, formData, {
        headers: {
          ...formData.getHeaders(),
          Cookie: cookieString,
          Referer: 'https://o.jdl.com/goToMainIframe.do'
        }
      })

      const responseData = response.data
      console.log('======库存分配导入响应 开始======: ')
      console.log(responseData)
      console.log('======库存分配导入响应 结束======: ')
      sendLog(`库存分配导入响应: ${JSON.stringify(responseData)}`)
      console.log('[IPC] 库存分配导入响应:', responseData)
      // { resultCode: '0', resultMessage: '5分钟内不要频繁操作!' }
      // {resultData: 'report/goodsStockConfig/goodsStockConfigImportLog-威名2-1751105299155.csv',resultCode: '1'}


      // resultCode '1' 代表同步成功
      if (responseData && responseData.resultCode === '1') {
        console.log('======结果码1 成功======: ')
        const logFileName = responseData.resultData
          ? responseData.resultData.split('/').pop()
          : '未知日志文件'
        return { success: true, message: `导入任务已提交，请在报表中心查看日志: ${logFileName}` }
      } else if (responseData && responseData.resultCode === '0') {
        console.log('======结果码0 失败======: ')
        return { success: false, message: responseData.resultMessage || '库存分配导入失败' }
      } else {
        console.log('======结果码其他 失败======: ')
        return { success: false, message: responseData.resultMessage }
      }
    } catch (error) {
      sendLog(`库存分配上传失败: ${error.message}`, 'error')
      return { success: false, message: `上传失败: ${error.message}` }
    }
  })

  ipcMain.handle('upload-status-update-file', async (event, { fileBuffer, csrfToken, cookies }) => {
    const url = `https://o.jdl.com/shopGoods/importUpdateShopGoodsStatus.do?_r=${Math.random()}`
    const FormData = require('form-data')
    const temp = require('temp').track() // For automatic cleanup of temp files

    let tempFilePath
    try {
      // 1. Write buffer to a temporary file
      const tempStream = temp.createWriteStream({ suffix: '.xls' })
      tempFilePath = tempStream.path
      tempStream.end(Buffer.from(fileBuffer))

      await logRequest(`[IPC] Status Update: Temporary file created at ${tempFilePath}`)

      // 2. Prepare FormData
      const formData = new FormData()
      formData.append('csrfToken', csrfToken)
      formData.append('updateShopGoodsStatusListFile', fs.createReadStream(tempFilePath))

      // 3. Prepare headers
      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const headers = {
        ...formData.getHeaders(),
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9,fr;q=0.8,de;q=0.7,en;q=0.6',
        origin: 'https://o.jdl.com',
        referer: 'https://o.jdl.com/goToMainIframe.do',
        'upgrade-insecure-requests': '1',
        Cookie: cookieString
      }

      // 4. Send request with axios
      await logRequest(`[IPC] Status Update: Uploading ${tempFilePath} to ${url}`)
      const response = await axiosInstance.post(url, formData, {
        headers,
        responseType: 'text' // Ensure we always get a string back
      })

      const responseText = response.data
      await logRequest(`[IPC] Status Update Response: ${responseText}`)

      // 5. Check response
      if (typeof responseText === 'string' && responseText.includes('成功')) {
        return { success: true, message: responseText }
      } else {
        const match =
          typeof responseText === 'string'
            ? responseText.match(/id="message" value="([^"]+)"/)
            : null
        const errorMessage = match ? match[1] : `启用商品失败，服务器响应: ${responseText.trim()}`
        return { success: false, message: errorMessage }
      }
    } catch (error) {
      const errorMessage = error.response?.data || error.message
      await logRequest(`[IPC] Status Update Upload Failed: ${errorMessage}`)
      return { success: false, message: `文件上传失败: ${errorMessage}` }
    } finally {
      // Cleanup is handled automatically by temp.track()
    }
  })

  ipcMain.handle('add-inventory', async (event, context) => {
    const { goodsList, store, warehouse, vendor, cookies } = context

    try {
      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const goodsJson = JSON.stringify(goodsList)

      let supplierIdValue = vendor.id
      if (typeof supplierIdValue === 'string' && /^[A-Za-z]+/.test(supplierIdValue)) {
        supplierIdValue = supplierIdValue.replace(/^[A-Za-z]+/, '')
      }

      const formData = new FormData()
      formData.append('id', '')
      formData.append('poNo', '')
      formData.append('goods', goodsJson)
      formData.append('deptId', store.deptId || store.id)
      formData.append('deptName', store.deptName || store.name)
      formData.append('supplierId', supplierIdValue)
      formData.append('warehouseId', warehouse.id)
      formData.append('billOfLading', '')
      formData.append('qualityCheckFlag', '')
      formData.append('sidChange', '0')
      formData.append('poType', '1')
      formData.append('address.senderName', '')
      formData.append('address.senderMobile', '')
      formData.append('address.senderPhone', '')
      formData.append('address.senderProvinceName', '-请选择-')
      formData.append('address.senderCityName', '-请选择-')
      formData.append('address.senderCountyName', '-请选择-')
      formData.append('address.senderTownName', '')
      formData.append('address.senderProvinceCode', '')
      formData.append('address.senderCityCode', '')
      formData.append('address.senderCountyCode', '')
      formData.append('address.senderTownCode', '')
      formData.append('address.senderAddress', '')
      formData.append('pickUpFlag', '0')
      formData.append('outPoNo', '')
      formData.append('crossDockingFlag', '0')
      formData.append('crossDockingSoNos', '')
      formData.append('isPorterTeam', '0')
      formData.append('orderType', 'CGRK')
      formData.append('poReturnMode', '1')
      formData.append('importFiles', '')

      const response = await fetch('https://o.jdl.com/poMain/downPoMain.do', {
        method: 'POST',
        body: formData,
        headers: {
          Cookie: cookieString,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          Referer: 'https://o.jdl.com/goToMainIframe.do',
          Origin: 'https://o.jdl.com'
        }
      })

      const responseText = await response.text()
      if (!response.ok) {
        console.error('添加入库单失败，响应状态:', response.status, '响应内容:', responseText)
        throw new Error(`网络响应错误: ${response.statusText}`)
      }

      console.log('[add-inventory] 添加入库单成功，响应内容:', responseText)

      // 假设操作成功，因为接口通常会返回一个页面而不是直接的JSON成功标识
      // 更好的做法是检查响应中是否有错误信息
      if (responseText.includes('error') || responseText.includes('失败')) {
        const errorMatch = responseText.match(/class="message error">([^<]+)</)
        const errorMessage = errorMatch ? errorMatch[1].trim() : '未知错误，请检查返回的HTML'
        return { success: false, message: `库存添加失败: ${errorMessage}` }
      }

      // 尝试从返回的页面中解析出采购单号
      const match = responseText.match(/id="poNo" value="([^"]+)"/)
      const poNo = match ? match[1] : '未知'

      return {
        success: true,
        message: `库存添加成功，采购单号: ${poNo}`,
        poNumber: poNo
      }
    } catch (error) {
      console.error('主进程[add-inventory]处理失败:', error)
      return { success: false, message: `主进程错误: ${error.message}` }
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
        Cookie: cookieString
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
    await fs.promises.unlink(filePath).catch((err) => console.error('删除临时文件失败:', err))
  }
}

// --- 物流属性导入相关函数 (从 importLogisticsProperties.js 迁移) ---

/**
 * 处理物流属性导入的核心逻辑
 */
async function processLogisticsProperties(
  skuList,
  department,
  cookies,
  logCallback,
  logisticsOptions
) {
  const BATCH_SIZE = 2000
  let processedCount = 0
  let failedCount = 0
  if (!skuList || !Array.isArray(skuList)) {
    throw new Error('skuList 无效或不是一个数组')
  }
  let totalBatches = Math.ceil(skuList.length / BATCH_SIZE)
  const failedResults = []

  logCallback(`SKU总数: ${skuList.length}, 将分成 ${totalBatches} 批进行处理。`)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE
    const endIdx = Math.min(startIdx + BATCH_SIZE, skuList.length)
    const batchSkus = skuList.slice(startIdx, endIdx)

    logCallback(
      `正在处理第 ${batchIndex + 1}/${totalBatches} 批, 包含 ${batchSkus.length} 个SKU...`
    )

    try {
      const result = await uploadLogisticsData(batchSkus, department, cookies, logisticsOptions)

      if (result.success) {
        processedCount += batchSkus.length
        logCallback(`批次 ${batchIndex + 1} 处理成功。`)
      } else {
        failedCount += batchSkus.length
        const errorMessage = result.message || `批次 ${batchIndex + 1} 处理失败`
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

  const isSuccess = failedCount === 0

  return {
    success: isSuccess,
    message: !isSuccess && failedResults.length > 0 ? failedResults.join('; ') : finalMessage,
    errorDetail: failedResults.length > 0 ? failedResults.join('; ') : null,
    isPartialSuccess
  }
}

/**
 * 上传单批物流属性数据
 */
async function uploadLogisticsData(batchSkus, department, cookies, logisticsOptions) {
  const excelBuffer = createLogisticsExcelBuffer(batchSkus, department, logisticsOptions)
  const FormData = require('form-data')

  // (调试功能) 保存一份到用户的下载目录
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const debugFileName = `logistics-attributes-debug-${timestamp}.xls`
    await saveBufferToDownloads(excelBuffer, debugFileName)
  } catch (e) {
    console.error('无法保存用于调试的Excel文件:', e)
  }

  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  const form = new FormData()
  form.append('importAttributeFile', excelBuffer, {
    filename: 'logistics-attributes.xls',
    contentType: 'application/vnd.ms-excel'
  })

  const url = 'https://o.jdl.com/goods/doImportGoodsLogistics.do?_r=' + Math.random()

  try {
    const response = await axiosInstance.post(url, form, {
      headers: {
        ...form.getHeaders(), // form-data 会自动设置正确的 Content-Type 和 boundary
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: 'https://o.jdl.com/goToMainIframe.do',
        Origin: 'https://o.jdl.com',
        Cookie: cookieString
      }
      // responseType 留空，让 axios 自动判断
    })

    const responseData = response.data
    // 处理响应数据
    console.log('上传物流属性数据响应:', responseData)

    // 根据响应格式处理结果
    if (typeof responseData === 'object' && responseData !== null) {
      if (responseData.success) {
        return {
          success: true,
          message: responseData.data || '操作成功',
          data: responseData
        }
      } else {
        const errorMessage = responseData.data || responseData.tipMsg || '操作失败'
        // 检查是否是5分钟限制错误
        if (
          typeof responseData.data === 'string' &&
          responseData.data.includes('5分钟内只能导入一次')
        ) {
          return {
            success: false,
            message: 'API限制：5分钟内只能导入一次，请稍后再试',
            data: responseData
          }
        }
        return {
          success: false,
          message: errorMessage,
          data: responseData
        }
      }
    }

    // 默认返回失败
    return { success: false, message: '服务器返回了未知格式的响应', data: responseData }
  } catch (error) {
    console.error('上传物流属性数据失败:', error)
    return { success: false, message: `请求发送失败: ${error.message}` }
  }
}

/**
 * 创建物流属性Excel文件的Buffer
 */
function createLogisticsExcelBuffer(skuList, department, logisticsOptions) {
  const {
    length = '120.00',
    width = '60.00',
    height = '6.00',
    grossWeight = '0.1'
  } = logisticsOptions || {}

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
  const data = skuList.map((sku) => [
    '', // 事业部商品编码 (为空)
    department.deptNo, // 事业部编码
    sku, // 商家商品编号
    length, // 长(mm)
    width, // 宽(mm)
    height, // 高(mm)
    '', // 净重(kg)
    grossWeight // 毛重(kg)
  ])
  const excelData = [headers, ...data]
  const worksheet = XLSX.utils.aoa_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  return XLSX.write(workbook, { bookType: 'xls', type: 'buffer' })
}

export { sendRequest }

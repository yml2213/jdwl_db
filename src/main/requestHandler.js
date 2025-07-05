'use strict'

import axios from 'axios'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import * as XLSX from 'xlsx'
import qs from 'qs'
import { loadCookies } from './loginManager'
import { saveBufferToDownloads } from './fileHandler'
import { net } from 'electron'
import { session } from 'electron'

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
 * @returns {Promise<Object>} - 响应数据
 */
function sendRequest(url, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[Main Process] 发送请求: ${options.method || 'GET'} ${url}`)
      console.log(`[Main Process] 请求头:`, JSON.stringify(options.headers || {}))

      const request = net.request({
        url,
        method: options.method || 'GET',
        redirect: 'follow',
        ...options
      })

      // 添加请求头
      if (options.headers) {
        Object.keys(options.headers).forEach((key) => {
          request.setHeader(key, options.headers[key])
        })
      }

      // 动态获取并添加 connect.sid cookie
      try {
        const cookies = await session.defaultSession.cookies.get({ domain: 'localhost' })
        const sessionCookie = cookies.find((c) => c.name === 'connect.sid')
        if (sessionCookie) {
          const cookieStr = `${sessionCookie.name}=${sessionCookie.value}`
          console.log(`[Main Process] 添加存储的会话cookie: ${cookieStr.substring(0, 50)}...`)
          request.setHeader('Cookie', cookieStr)
        }
      } catch (e) {
        console.error('[Main Process] 获取会话cookie失败:', e)
      }

      // 接收数据
      let responseData = ''

      // 处理响应
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          try {
            let parsedData = responseData
            if (
              responseData &&
              response.headers['content-type'] &&
              response.headers['content-type'].includes('application/json')
            ) {
              parsedData = JSON.parse(responseData)
            }
            resolve({
              data: parsedData,
              status: response.statusCode,
              headers: response.headers
            })
          } catch (error) {
            console.error('[Main Process] 解析响应数据失败:', error)
            console.log('[Main Process] 原始响应数据:', responseData.substring(0, 200) + '...')
            reject(new Error(`解析响应数据失败: ${error.message}`))
          }
        })
      })

      // 处理错误
      request.on('error', (error) => {
        console.error('[Main Process] 请求错误:', error)
        reject(error)
      })

      // 发送请求体
      if (options.body) {
        const data = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
        request.write(data)
      }

      // 结束请求
      request.end()
    } catch (error) {
      console.error('[Main Process] 发送请求时出错:', error)
      reject(error)
    }
  })
}

// 清除存储的会话cookie
function clearSessionCookies() {
  // This function might still be useful if we want to force a logout from the main process side
  console.log('[Main Process] 清除会话cookie (No longer clearing local variable)')
}

async function getCsrfTokenFromCookies(cookies) {
  const tokenCookie = cookies.find((cookie) => cookie.name === 'csrfToken')
  return tokenCookie ? tokenCookie.value : ''
}

/**
 * 设置所有主进程的IPC事件处理器
 */
export function setupRequestHandlers() {
  console.log('[Main Process] 设置请求处理器...')

  // 处理渲染进程的请求
  ipcMain.handle('sendRequest', async (event, url, options) => {
    try {
      console.log(`[IPC] 收到渲染进程请求: ${url}`)

      // 确保options存在
      options = options || {}
      // 确保headers存在
      options.headers = options.headers || {}

      // 添加默认的Content-Type，如果没有指定
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json'
      }

      const response = await sendRequest(url, options)
      console.log('[IPC] 请求完成，返回数据')
      return response.data
    } catch (error) {
      console.error('[IPC] 处理请求失败:', error)
      throw error
    }
  })

  // 清除会话处理程序
  ipcMain.on('clearSession', () => {
    clearSessionCookies()
  })

  console.log('[Main Process] 请求处理器设置完成')
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

export { sendRequest, clearSessionCookies }

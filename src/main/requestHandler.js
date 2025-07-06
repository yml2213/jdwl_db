'use strict'

import axios from 'axios'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { net } from 'electron'
import { session } from 'electron'

// 定义后端服务的基础URL，优先从环境变量读取
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:2333'

// 存储和管理会话级别的Cookie
const sessionCookies = new Map()

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
      // console.log(`[Main Process] 发送请求: ${options.method || 'GET'} ${url}`)
      // console.log(`[Main Process] 请求头:`, JSON.stringify(options.headers || {}))

      // 如果URL是相对路径，则添加基础URL
      const finalUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`

      const request = net.request({
        url: finalUrl,
        method: options.method || 'GET',
        redirect: 'follow',
        session: options.session || session.defaultSession,
        useSessionCookies: true
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
/**
 * 设置所有主进程的IPC事件处理器
 */
export function setupRequestHandlers() {
  console.log('[Main Process] 设置请求处理器...')

  // 处理渲染进程的请求
  ipcMain.handle('sendRequest', async (event, url, options) => {
    try {
      // console.log(`[IPC] 收到渲染进程请求: ${url}`)

      // 确保options存在
      options = options || {}
      // 确保headers存在
      options.headers = options.headers || {}

      // 添加默认的Content-Type，如果没有指定
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json'
      }

      const response = await sendRequest(url, options)
      // console.log('[IPC] 请求完成，返回数据')
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
// --- 物流属性导入相关函数 (从 importLogisticsProperties.js 迁移) ---
export { sendRequest, clearSessionCookies }

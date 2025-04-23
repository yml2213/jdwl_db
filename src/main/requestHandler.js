import axios from 'axios'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

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
  timeout: 30000, // 默认30秒超时
  validateStatus: (status) => status >= 200 && status < 300 // 定义有效的状态码
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

    // 将fetch风格的options转换为axios接受的格式
    const axiosOptions = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000
    }

    // 处理请求体
    if (options.body) {
      if (typeof options.body === 'string') {
        try {
          // 如果body是JSON字符串，解析它
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

    // axios自动解析了JSON
    const result = response.data

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

export { sendRequest }

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
      timeout: options.timeout || 30000,
      withCredentials: true // 确保跨域请求发送cookie
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
      // 如果是FormData类型，直接传递
      if (options.body instanceof FormData) {
        // 对于FormData类型的请求，需要特殊处理
        console.log('处理FormData请求')

        // axios在Node.js环境中处理FormData的方式与浏览器不同
        // 需要手动设置boundary
        const boundary = '--------------------------' + Date.now().toString(16)

        // 设置multipart/form-data的Content-Type
        axiosOptions.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`

        // 将FormData转换为适合axios的格式
        const formData = options.body
        axiosOptions.data = formData

        console.log('发送FormData请求，boundary:', boundary)
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

export { sendRequest }

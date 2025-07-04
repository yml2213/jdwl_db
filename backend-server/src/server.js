import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import sessionFileStore from 'session-file-store'
import crypto from 'crypto'
import logService from './utils/logService.js'


const app = express()
const port = 2333

const FileStore = sessionFileStore(session)
const sessionTTL = 24 * 60 * 60 * 1000 * 30  // 30天

// 存储每个客户端ID对应的响应对象，用于服务器发送事件
const clients = {}

// Middlewares
app.use(
  cors({
    origin: function (origin, callback) {
      // 在开发环境中，允许来自任何源的请求
      // 在生产环境中，您可能希望有一个白名单
      // 对于Electron应用，origin可能是undefined (file://)
      callback(null, true)
    },
    credentials: true // 允许发送和接收cookies
  })
)
app.use(express.json()) // 解析JSON格式的请求体

// Session middleware - 使用文件存储实现持久化
app.use(

  session({
    store: new FileStore({
      path: './sessions', // 会话文件存储路径
      ttl: sessionTTL, // 会话有效期（秒），这里是 30天
      reapInterval: -1, // 禁用自动清理过期的会话文件，可根据需要调整
      logFn: function () { } // 禁用默认的日志输出，保持控制台干净
    }),
    secret: 'a_secret_key_for_jdwl_db_session', // 在生产环境中应使用更安全的密钥，并从环境变量中读取
    resave: false,
    saveUninitialized: false, // 改为false，仅在会话被修改时才创建文件
    cookie: {
      secure: false, // 如果是https，应设为true
      httpOnly: true,
      maxAge: sessionTTL // 30天
    }
  })
)

// --- 新增：SSE日志流端点 ---
app.get('/api/log-stream/:taskId', (req, res) => {
  const { taskId } = req.params
  console.log(`[SSE] 客户端已连接，订阅任务ID: ${taskId}`)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders() //

  const logListener = (logData) => {
    console.log(`[SSE] 发送日志给 ${taskId}:`, logData.message)
    res.write(`data: ${JSON.stringify(logData)}\n\n`)
  }

  const endListener = (resultData) => {
    console.log(`[SSE] 任务 ${taskId} 完成，发送最终结果并关闭连接。`)
    res.write(`data: ${JSON.stringify({ event: 'end', ...resultData })}\n\n`)
    res.end()
    // 清理监听器
    logService.off(taskId, logListener)
  }

  logService.on(taskId, logListener)
  logService.once(`${taskId}-end`, endListener)

  req.on('close', () => {
    console.log(`[SSE] 客户端断开连接，任务ID: ${taskId}`)
    logService.off(taskId, logListener)
    logService.off(`${taskId}-end`, endListener)
  })
})

// 根路由，用于测试服务器是否运行
app.get('/', (req, res) => {
  res.send('Backend server is running!')
})

/**
 * @description 接收并处理前端发送的会话信息
 * 前端登录成功后，将调用此接口，并将信息存储在服务器会话中
 */
app.post('/api/session', async (req, res) => {
  const { uniqueKey, cookies } = req.body

  console.log('收到会话创建请求:', {
    uniqueKey: uniqueKey ? `${uniqueKey.substring(0, 10)}...` : '无',
    hasCookies: cookies && cookies.length > 0,
    hasSupplierInfo: !!req.body.supplierInfo,
    hasDepartmentInfo: !!req.body.departmentInfo
  })

  if (!uniqueKey || !cookies) {
    console.warn('会话创建失败: 缺少必要数据')
    return res.status(400).json({ message: 'Missing session data.' })
  }

  // 将会话数据存储在 req.session 中
  // express-session 会自动处理 cookie 和 session ID
  req.session.context = req.body

  // 保存会话
  req.session.save((err) => {
    if (err) {
      console.error('保存会话失败:', err)
      return res.status(500).json({ message: 'Failed to save session.' })
    }
    console.log('会话创建成功，Session ID:', req.sessionID)
    res.status(200).json({ message: 'Session initialized successfully.' })
  })
})

/**
 * @description 检查当前会话的状态
 */
app.get('/api/session/status', (req, res) => {
  console.log('检查会话状态, Session ID:', req.sessionID)
  console.log('会话上下文存在:', !!req.session?.context)

  if (req.session && req.session.context) {
    console.log('会话有效，用户已登录')
    res.status(200).json({
      success: true,
      loggedIn: true,
      context: req.session.context
    })
  } else {
    console.log('会话无效或用户未登录')
    res.status(200).json({
      success: true,
      loggedIn: false
    })
  }
})

/**
 * @description 初始化应用，获取一个操作ID并存入会话
 */
app.post('/api/init', async (req, res) => {
  if (!req.session.context) {
    return res.status(401).json({ message: '无效的会话，请先登录' })
  }

  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const taskPath = path.join(__dirname, 'tasks', 'initSession.task.js')
    const taskModule = await import(taskPath)
    const taskFunction = taskModule.default.execute

    const result = await taskFunction({}, () => { }, req.session.context)

    if (result.success) {
      // 将 operationId 存入会话，供其他任务使用
      req.session.operationId = result.operationId
      req.session.save((err) => {
        if (err) {
          console.error('会话保存失败:', err)
          return res.status(500).json({ success: false, message: '会话保存失败' })
        }
        res.status(200).json({ success: true, operationId: result.operationId })
      })
    } else {
      throw new Error(result.message || '初始化任务失败')
    }
  } catch (error) {
    console.error('执行 /api/init 时出错:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * @description 新的、简化的工作流执行接口
 */
app.post('/api/execute-flow', async (req, res) => {
  const { flowName, payload } = req.body

  if (!req.session.context) {
    return res.status(401).json({ message: '无效的会话，请先登录' })
  }

  const taskId = crypto.randomUUID()

  // 立即返回任务ID，让前端可以开始监听日志
  res.status(202).json({ success: true, taskId })

  // 异步执行工作流
  setTimeout(async () => {
    const log = (message, type = 'info') => {
      const logData = { message, type, timestamp: new Date().toISOString() }
      // 使用日志服务广播日志
      logService.emit(taskId, logData)
      console.log(`[${flowName}] [${type.toUpperCase()}]: ${message}`)
    }

    try {
      const __dirname = path.dirname(fileURLToPath(import.meta.url))
      const flowPath = path.join(__dirname, 'flows', `${flowName}.flow.js`)
      const flowModule = await import(flowPath)

      if (!flowModule.default || typeof flowModule.default.execute !== 'function') {
        throw new Error(`工作流 ${flowName} 或其 execute 方法未找到`)
      }

      const sessionData = {
        ...req.session.context,
        store: payload.store,
        department: payload.department,
        vendor: payload.vendor,
        session: req.session,
      }

      if (req.session.operationId) {
        sessionData.operationId = req.session.operationId
      }

      const result = await flowModule.default.execute(payload, sessionData, log)
      logService.emit(`${taskId}-end`, { success: true, data: result })

    } catch (error) {
      console.error(`执行工作流 ${flowName} 时出错:`, error)
      const errorMessage = error.message || '工作流执行时发生未知错误'
      log(errorMessage, 'error')
      logService.emit(`${taskId}-end`, { success: false, message: errorMessage })
    }
  }, 0)
})

/**
 * @description 执行单个任务的端点
 */
app.post('/task', async (req, res) => {
  const { taskName, payload } = req.body

  if (!req.session.context) {
    return res.status(401).json({ message: '无效的会话，请先登录' })
  }

  if (!taskName) {
    return res.status(400).json({ success: false, message: '必须提供 taskName' })
  }

  const taskId = crypto.randomUUID()
  // 立即返回任务ID
  res.status(202).json({ success: true, taskId })

  // 异步执行任务
  setTimeout(async () => {
    const sessionData = {
      ...req.session.context,
      store: payload.store,
      department: payload.department,
      vendor: payload.vendor,
      session: req.session,
    }
    if (req.session.operationId) {
      sessionData.operationId = req.session.operationId
    }

    const updateFn = (status) => {
      const message = typeof status === 'string' ? status : (status.message || JSON.stringify(status))
      const type = status.error ? 'error' : 'info'
      const logData = { message, type, timestamp: new Date().toISOString() }
      logService.emit(taskId, logData)
      console.log(`[Task: ${taskName}] [${type.toUpperCase()}]: ${message}`)
    }

    try {
      const __dirname = path.dirname(fileURLToPath(import.meta.url))
      const taskPath = path.join(__dirname, 'tasks', `${taskName}.task.js`)
      const taskModule = await import(taskPath)

      const taskFunction = taskModule.default?.execute

      if (!taskFunction) {
        throw new Error(`任务 ${taskName} 未找到或其导出格式不正确`)
      }

      updateFn(`开始执行任务 ${taskName}...`)
      const result = await taskFunction(payload, updateFn, sessionData)
      updateFn(`任务 ${taskName} 执行完成。`)
      logService.emit(`${taskId}-end`, { success: true, data: result })

    } catch (error) {
      console.error(`执行任务 ${taskName} 时出错:`, error)
      const errorMessage = error.message || '任务执行时发生未知错误'
      updateFn({ message: errorMessage, error: true })
      logService.emit(`${taskId}-end`, { success: false, message: errorMessage })
    }
  }, 0)
})

// --- Start Server ---
app.listen(port, '0.0.0.0', () => {
  console.log(`服务已启动，监听所有地址，端口：${port}`)
  console.log(`可通过 http://localhost:${port} 或本机IP地址访问`)
})

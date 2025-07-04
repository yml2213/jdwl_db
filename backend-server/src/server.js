import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import sessionFileStore from 'session-file-store'
import crypto from 'crypto'
import logService, { events as logEvents } from './utils/logService.js'


const app = express()
const port = 2333

const FileStore = sessionFileStore(session)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const sessionTTL = 24 * 60 * 60 * 30  // 30天 (单位: 秒)

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
      path: path.join(__dirname, 'sessions'), // 修正路径
      ttl: sessionTTL,
      reapInterval: -1,
      logFn: function () { }
    }),
    secret: 'a_secret_key_for_jdwl_db_session',
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: sessionTTL * 1000, // cookie 的 maxAge 需要毫秒
      sameSite: 'lax'
    },
    name: 'jdwl.sid'
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
    // 这里的 console.log 是用于在后端调试 SSE 连接本身，可以保留
    console.log(`[SSE] 发送日志给 ${taskId}:`, logData.message)
    res.write(`data: ${JSON.stringify(logData)}\n\n`)
  }

  const endListener = (resultData) => {
    console.log(`[SSE] 任务 ${taskId} 完成，发送最终结果并关闭连接。`)
    res.write(`data: ${JSON.stringify({ event: 'end', ...resultData })}\n\n`)
    res.end()
    // 清理监听器
    logEvents.off(taskId, logListener)
  }

  logEvents.on(taskId, logListener)
  logEvents.once(`${taskId}-end`, endListener)

  req.on('close', () => {
    console.log(`[SSE] 客户端断开连接，任务ID: ${taskId}`)
    logEvents.off(taskId, logListener)
    logEvents.off(`${taskId}-end`, endListener)
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
    hasDepartmentInfo: !!req.body.departmentInfo,
    sessionID: req.sessionID
  })

  if (!uniqueKey || !cookies) {
    console.warn('会话创建失败: 缺少必要数据')
    return res.status(400).json({ message: 'Missing session data.' })
  }

  // 将会话数据存储在 req.session 中
  // express-session 会自动处理 cookie 和 session ID
  req.session.context = req.body
  req.session.authenticated = true // 显式设置认证状态
  req.session.created_at = new Date().toISOString()

  // 保存会话
  req.session.save((err) => {
    if (err) {
      console.error('保存会话失败:', err)
      return res.status(500).json({ message: 'Failed to save session.' })
    }
    console.log('会话创建成功，Session ID:', req.sessionID)
    // 返回会话ID，便于调试
    res.status(200).json({
      message: 'Session initialized successfully.',
      sessionID: req.sessionID
    })
  })
})

/**
 * @description 检查当前会话的状态
 */
app.get('/api/session/status', (req, res) => {
  console.log('检查会话状态, Session ID:', req.sessionID)
  console.log('会话对象存在:', !!req.session)
  console.log('会话上下文存在:', !!req.session?.context)
  console.log('会话认证状态:', !!req.session?.authenticated)
  console.log('会话创建时间:', req.session?.created_at || '未知')
  console.log('请求的Cookie头:', req.headers.cookie)

  // 找出当前请求中是否包含会话ID cookie
  let foundSessionCookie = false
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim())
    foundSessionCookie = cookies.some(c => c.startsWith('jdwl.sid='))
    console.log('请求中包含会话Cookie:', foundSessionCookie)
  }

  if (req.session && req.session.authenticated && req.session.context) {
    console.log('会话有效，用户已登录')
    res.status(200).json({
      success: true,
      loggedIn: true,
      context: req.session.context,
      sessionID: req.sessionID
    })
  } else {
    console.log('会话无效或用户未登录，详情:', {
      hasSession: !!req.session,
      isAuthenticated: !!req.session?.authenticated,
      hasContext: !!req.session?.context,
      cookieHeader: !!req.headers.cookie,
      foundSessionCookie
    })

    // 如果会话存在但不完整，在日志中显示更多信息
    if (req.session) {
      console.log('会话存在但不完整，会话ID:', req.sessionID)
      // 尝试打印出会话内容，但限制大小以避免日志过大
      const sessionKeys = Object.keys(req.session)
      console.log('会话包含的键:', sessionKeys)
      // 如果存在context但不完整，查看是什么原因
      if (req.session.context && !req.session.authenticated) {
        console.log('会话有context但未认证')
      }
    }

    res.status(200).json({
      success: true,
      loggedIn: false,
      sessionID: req.sessionID
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
    const { log } = logService.createLogger(taskId, flowName)

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
      logEvents.emit(`${taskId}-end`, { success: true, data: result })

    } catch (error) {
      const logger = logService.createLogger(taskId, flowName)
      const errorMessage = error.message || '工作流执行时发生未知错误'
      logger.error(errorMessage, { stack: error.stack })
      logEvents.emit(`${taskId}-end`, { success: false, message: errorMessage })
    }
  }, 0)
})

/**
 * @description 执行单个任务的端点
 */
app.post('/task', async (req, res) => {
  const { taskName, payload, mode } = req.body

  if (!req.session.context) {
    return res.status(401).json({ message: '无效的会话，请先登录' })
  }

  if (!taskName) {
    return res.status(400).json({ success: false, message: '必须提供 taskName' })
  }

  const taskId = crypto.randomUUID()
  // 立即返回任务ID
  res.status(202).json({ success: true, taskId })

  // 将 mode 添加到 payload，以兼容旧的前端请求结构
  if (mode) {
    payload.mode = mode
  }

  // 异步执行任务
  setTimeout(async () => {
    const { updateFn, error: logError } = logService.createLogger(taskId, taskName)

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
      logEvents.emit(`${taskId}-end`, { success: true, data: result })

    } catch (error) {
      console.error(`执行任务 ${taskName} 时出错:`, error)
      const errorMessage = error.message || '任务执行时发生未知错误'
      logError(errorMessage, { stack: error.stack })
      logEvents.emit(`${taskId}-end`, { success: false, message: errorMessage })
    }
  }, 0)
})

// --- Start Server ---
app.listen(port, '0.0.0.0', () => {
  console.log(`服务已启动，监听所有地址，端口：${port}`)
  console.log(`可通过 http://localhost:${port} 或本机IP地址访问`)
})

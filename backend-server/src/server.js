import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import sessionFileStore from 'session-file-store'


const app = express()
const port = 3000

const FileStore = sessionFileStore(session)
const sessionTTL = 24 * 60 * 60 * 1000 * 30  // 30天

// 存储每个客户端ID对应的响应对象，用于服务器发送事件
const clients = {}

// Middlewares
app.use(
  cors({
    origin: 'http://localhost:5173', // 前端地址
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

  if (!uniqueKey || !cookies) {
    return res.status(400).json({ message: 'Missing session data.' })
  }

  // 将会话数据存储在 req.session 中
  // express-session 会自动处理 cookie 和 session ID
  req.session.context = req.body

  res.status(200).json({ message: 'Session initialized successfully.' })
})

/**
 * @description 检查当前会话的状态
 */
app.get('/api/session/status', (req, res) => {
  if (req.session && req.session.context) {
    res.status(200).json({
      success: true,
      loggedIn: true,
      context: req.session.context
    })
  } else {
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

  const logs = []
  const log = (message, type = 'info') => {
    logs.push({ message, type, timestamp: new Date().toISOString() })
    console.log(`[${flowName}] [${type.toUpperCase()}]: ${message}`)
  }

  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const flowPath = path.join(__dirname, 'flows', `${flowName}.flow.js`)
    const flowModule = await import(flowPath)

    if (!flowModule.default || typeof flowModule.default.execute !== 'function') {
      throw new Error(`工作流 ${flowName} 或其 execute 方法未找到`)
    }

    // 将前端传递的 store 和 department 信息合并到会话上下文中
    // 以确保后续任务能获取到完整的店铺和事业部数据
    const sessionData = {
      ...req.session.context,
      store: payload.store,
      department: payload.store, // department 信息通常和 store 绑定在一起
      vendor: payload.vendor
    }
    // 注入 operationId
    if (req.session.operationId) {
      sessionData.operationId = req.session.operationId
    }

    const result = await flowModule.default.execute(payload, sessionData, log)

    res.status(200).json({ success: true, logs, data: result })
  } catch (error) {
    console.error(`执行工作流 ${flowName} 时出错:`, error)
    // 即使失败，也返回日志
    res.status(500).json({ success: false, logs, message: error.message })
  }
})

/**
 * @description 执行单个任务的端点
 */
app.post('/task', async (req, res) => {
  const { taskName, payload } = req.body

  if (!taskName) {
    return res.status(400).json({ success: false, message: '必须提供 taskName' })
  }

  // 从会话中获取上下文，并注入 operationId
  const sessionData = req.session.context || {}
  if (req.session.operationId) {
    sessionData.operationId = req.session.operationId
  }

  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const taskPath = path.join(__dirname, 'tasks', `${taskName}.task.js`)
    const taskModule = await import(taskPath)

    // 检查模块导出的是函数还是对象
    const taskFunction = typeof taskModule.default === 'function'
      ? taskModule.default
      : (taskModule.default && typeof taskModule.default.execute === 'function'
        ? taskModule.default.execute
        : null)

    if (!taskFunction) {
      throw new Error(`任务 ${taskName} 未找到或其导出格式不正确`)
    }

    // 创建一个空的更新函数
    const updateFn = (status) => {
      console.log(`任务 ${taskName} 状态更新:`, status)
    }
    const result = await taskFunction(payload, updateFn, sessionData)

    res.status(200).json({ success: true, data: result })
  } catch (error) {
    console.error(`执行任务 ${taskName} 时出错:`, error)
    res.status(500).json({ success: false, message: error.message, stack: error.stack })
  }
})

app.listen(port, () => {
  console.log(`服务已启动，地址: http://localhost:${port}`)
})

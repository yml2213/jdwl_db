import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'

const app = express()
const port = 3000

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

// Session middleware
app.use(
  session({
    secret: 'a_secret_key_for_jdwl_db_session', // 在生产环境中应使用更安全的密钥，并从环境变量中读取
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // 如果是https，应设为true
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

    const result = await flowModule.default.execute(payload, req.session.context, log)

    res.status(200).json({ success: true, logs, data: result })
  } catch (error) {
    console.error(`执行工作流 ${flowName} 时出错:`, error)
    // 即使失败，也返回日志
    res.status(500).json({ success: false, logs, message: error.message })
  }
})

app.listen(port, () => {
  console.log(`服务已启动，地址: http://localhost:${port}`)
})

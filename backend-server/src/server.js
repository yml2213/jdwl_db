import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'

const app = express()
const port = 3000

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
 * @description 通用的任务执行接口
 */
app.post('/api/execute-task', async (req, res) => {
  // 不再需要从 body 中获取 sessionId
  const { taskName, payload } = req.body

  // 1. 验证会话
  if (!req.session.context) {
    return res.status(401).json({ message: '无效的会话，请先登录' })
  }

  if (!taskName || !payload) {
    return res.status(400).json({ message: '缺少 taskName 或 payload' })
  }

  try {
    // 2. 动态加载任务模块
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const taskPath = path.join(__dirname, 'tasks', `${taskName}.task.js`)
    const taskModule = await import(taskPath)

    if (!taskModule.default || typeof taskModule.default.execute !== 'function') {
      throw new Error(`任务 ${taskName} 或其 execute 方法未找到`)
    }

    // 3. 执行任务
    console.log(`准备执行任务: ${taskName}`)

    // 任务模块已更新，直接将会话上下文传递给任务
    const result = await taskModule.default.execute(payload, req.session.context)

    // 4. 返回结果
    res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error(`执行任务 ${taskName} 时出错:`, error)
    res.status(500).json({ success: false, message: error.message })
  }
})

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})

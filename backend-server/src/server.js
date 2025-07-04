import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import sessionFileStore from 'session-file-store'
import crypto from 'crypto'
import { WebSocketServer } from 'ws'
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

// --- 启动服务器 ---
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`服务已启动，监听所有地址，端口：${port}`)
  console.log(`可通过 http://localhost:${port} 或本机IP地址访问`)
})

// --- WebSocket 服务器实现 ---
const wss = new WebSocketServer({ server })

// 用于追踪与单个WebSocket连接关联的所有任务ID
const wsTasks = new Map()

wss.on('connection', (ws, req) => {
  console.log('[WebSocket] 客户端已连接')
  wsTasks.set(ws, new Set())

  // 从http请求中恢复session
  // 注意：这依赖于 express-session 和 session-file-store 的工作方式
  const fakeReq = {
    headers: req.headers,
    sessionStore: app.get('sessionStore'), // 我们需要将session store暴露出来
    sessionID: null
  }

  // 从cookie中解析sessionID
  const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=')
    acc[key] = value
    return acc
  }, {})

  const sidCookie = cookies?.['jdwl.sid']
  if (sidCookie) {
    // express-session 会对 session ID 进行签名，我们需要去掉 's:' 前缀
    fakeReq.sessionID = sidCookie.split(':')[1].split('.')[0]
  }

  ws.on('message', async (message) => {
    let msg
    try {
      msg = JSON.parse(message)
      console.log('[WebSocket] 收到格式化消息:', msg)
    } catch (e) {
      console.error('[WebSocket] 无法解析消息:', message)
      return
    }

    if (msg.action === 'start_task') {
      const { taskName, taskId, payload, mode } = msg

      if (!taskId || !taskName) {
        ws.send(JSON.stringify({ event: 'error', message: 'start_task 消息缺少 taskId 或 taskName' }))
        return
      }

      // 追踪这个任务ID
      wsTasks.get(ws).add(taskId)

      // 为这个特定的任务设置事件监听器
      const logListener = (logData) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ event: 'log', taskId, data: logData }))
        }
      }
      const endListener = (resultData) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ event: 'end', taskId, ...resultData }))
        }
        // 任务结束，清理监听器
        logEvents.off(taskId, logListener)
        logEvents.off(`${taskId}-end`, endListener)
        wsTasks.get(ws)?.delete(taskId)
      }

      logEvents.on(taskId, logListener)
      logEvents.once(`${taskId}-end`, endListener)

      // 使用 setTimeout 异步执行任务，与旧实现保持一致
      setTimeout(async () => {
        app.get('sessionStore').get(fakeReq.sessionID, async (err, session) => {
          if (err || !session) {
            console.error('[WebSocket] 无法获取会话:', err)
            logEvents.emit(`${taskId}-end`, { success: false, message: '无法获取会话，请重新登录' })
            return
          }

          if (mode) payload.mode = mode

          const { updateFn, error: logError } = logService.createLogger(taskId, taskName)
          const sessionData = { ...session.context, ...payload, session }
          if (session.operationId) sessionData.operationId = session.operationId

          try {
            const taskPath = path.join(__dirname, 'tasks', `${taskName}.task.js`)
            const taskModule = await import(taskPath)
            const taskFunction = taskModule.default?.execute
            if (!taskFunction) throw new Error(`任务 ${taskName} 未找到或其导出格式不正确`)

            updateFn(`开始执行任务 ${taskName}...`)
            const result = await taskFunction(payload, updateFn, sessionData)
            updateFn(`任务 ${taskName} 执行完成。`)

            if (result && result.success === false) {
              logEvents.emit(`${taskId}-end`, { success: false, message: result.message })
            } else {
              logEvents.emit(`${taskId}-end`, { success: true, data: result })
            }
          } catch (error) {
            const errorMessage = error.message || '任务执行时发生未知错误'
            logError(errorMessage, { stack: error.stack })
            logEvents.emit(`${taskId}-end`, { success: false, message: errorMessage })
          }
        })
      }, 0)
    }
  })

  ws.on('close', () => {
    console.log('[WebSocket] 客户端已断开连接')
    // 清理该连接关联的所有任务的监听器
    if (wsTasks.has(ws)) {
      const tasks = wsTasks.get(ws)
      tasks.forEach(taskId => {
        // 这里的清理比较棘手，因为监听器函数是在另一个作用域中定义的
        // 这是一个简化版，更好的实现需要一个全局的监听器管理器
        logEvents.removeAllListeners(taskId)
        logEvents.removeAllListeners(`${taskId}-end`)
        console.log(`[WebSocket] 清理了任务 ${taskId} 的监听器`)
      })
      wsTasks.delete(ws)
    }
  })

  ws.on('error', (error) => {
    console.error('[WebSocket] 发生错误:', error)
  })
})

// 为了让websocket能访问session store
app.set('sessionStore', app.get('store'))

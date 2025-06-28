import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createOrUpdateSession, getSession } from './db.js'

const app = express()
const port = 3000

// Middlewares
app.use(cors()) // 允许跨域请求
app.use(express.json()) // 解析JSON格式的请求体

// 根路由，用于测试服务器是否运行
app.get('/', (req, res) => {
  res.send('Backend server is running!')
})

/**
 * @description 接收并处理前端发送的会话信息
 * 前端登录成功后，将调用此接口
 */
app.post('/api/session', async (req, res) => {
  const { uniqueKey, ...sessionData } = req.body

  if (!uniqueKey || !sessionData.cookies) {
    return res.status(400).json({ message: 'Missing session data.' })
  }

  try {
    const dataToStore = {
      uniqueKey,
      ...sessionData
    }
    const sessionId = await createOrUpdateSession(dataToStore)
    res.status(200).json({ sessionId })
  } catch (error) {
    console.error('[API /session] Error:', error)
    res.status(500).json({ message: 'Failed to create or update session.' })
  }
})

/**
 * @description 通用的任务执行接口
 */
app.post('/api/execute-task', async (req, res) => {
  const { sessionId, taskName, payload } = req.body

  if (!sessionId || !taskName || !payload) {
    return res.status(400).json({ message: '缺少 sessionId, taskName 或 payload' })
  }

  // 1. 验证会话
  const session = await getSession(sessionId)

  if (!session) {
    return res.status(401).json({ message: '无效的会话ID' })
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
    console.log(`Executing task: ${taskName}`)
    const result = await taskModule.default.execute(payload, session)

    // 4. 返回结果
    res.status(200).json(result)
  } catch (error) {
    console.error(`执行任务 ${taskName} 时出错:`, error)
    // Be careful not to leak stack traces or sensitive info in production
    res.status(500).json({ success: false, message: error.message })
  }
})

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})

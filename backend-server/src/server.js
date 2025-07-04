import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import session from 'express-session'
import FileStore from 'session-file-store'
import path from 'path'
import { fileURLToPath } from 'url'

// --- 基本设置 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

// --- 会话管理 ---
const AppFileStore = FileStore(session)
const sessionMiddleware = session({
    store: new AppFileStore({ path: './sessions', logFn: () => { } }),
    secret: 'your-secret-key', // 在生产环境中应使用更安全的密钥
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // 在生产中如果使用HTTPS，应设为 true
})
app.use(sessionMiddleware)

// 简单的认证检查中间件
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        next()
    } else {
        res.status(401).send('Unauthorized')
    }
}

// --- API Endpoints ---
app.use(express.json())

// 登录接口
app.post('/api/login', (req, res) => {
    const { username } = req.body
    if (username) {
        req.session.user = { name: username }
        req.session.save(() => {
            res.json({ success: true, message: '登录成功' })
        })
    } else {
        res.status(400).json({ success: false, message: '缺少用户名' })
    }
})

// 登出接口
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: '登出成功' })
    })
})

// 新增：创建会话状态接口
app.post('/api/create-session', (req, res) => {
    const { uniqueKey, cookies, supplierInfo, departmentInfo } = req.body
    if (uniqueKey && cookies && supplierInfo && departmentInfo) {
        req.session.user = { name: supplierInfo.name, uniqueKey }
        req.session.context = req.body // Save the whole context
        req.session.save((err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Session save error' })
            }
            res.json({ success: true, message: '会话创建成功' })
        })
    } else {
        res.status(400).json({ success: false, message: '缺少创建会话所需的数据' })
    }
})

// 新增：获取详细会话状态接口
app.get('/api/session-status', (req, res) => {
    if (req.session && req.session.user && req.session.context) {
        res.json({ loggedIn: true, context: req.session.context })
    } else {
        res.json({ loggedIn: false, context: null })
    }
})

// 检查会话状态接口
app.get('/api/session', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user })
    } else {
        res.json({ loggedIn: false })
    }
})

// 存储会话数据
app.post('/api/session-data', requireAuth, (req, res) => {
    req.session.data = req.body.data
    res.json({ success: true })
})

// 获取会话数据
app.get('/api/session-data', requireAuth, (req, res) => {
    res.json({ success: true, data: req.session.data || null })
})

// --- WebSocket 通信 ---
const clients = new Map()

// 升级HTTP连接到WebSocket时，注入会话信息
server.on('upgrade', (request, socket, head) => {
    sessionMiddleware(request, {}, () => {
        if (!request.session || !request.session.id) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request)
        })
    })
})

const restoreSession = async (sessionId) => {
    const sessionFilePath = path.join(__dirname, 'sessions', `${sessionId}.json`)
    try {
        const sessionData = await import(sessionFilePath, { assert: { type: 'json' } })
        return sessionData.default
    } catch (error) {
        console.error(`[Session] 无法恢复会话 ${sessionId}:`, error)
        return null
    }
}

wss.on('connection', (ws, request) => {
    const sessionId = request.session.id
    ws.sessionId = sessionId
    clients.set(sessionId, ws)
    console.log(`[WebSocket] 客户端已连接, Session ID: ${sessionId}`)

    ws.on('message', async (message) => {
        try {
            const { action, taskId, taskName, isFlow, payload } = JSON.parse(message.toString())

            if (action === 'start_task') {
                console.log(`[WebSocket] 收到任务: taskId=${taskId}, taskName=${taskName}, isFlow=${isFlow}`)

                // 1. 恢复会话数据
                const sessionData = await restoreSession(ws.sessionId)
                if (!sessionData) {
                    ws.send(JSON.stringify({ event: 'error', taskId, message: '无法恢复会话，请重新登录' }))
                    return
                }

                // 2. 创建日志更新函数
                const updateFn = (logMessage, level = 'info') => {
                    ws.send(JSON.stringify({ event: 'log', taskId, data: logMessage, level }))
                }

                try {
                    // 3. 根据 isFlow 标志动态加载并执行
                    const modulePath = isFlow
                        ? `./flows/${taskName}.flow.js`
                        : `./tasks/${taskName}.task.js`
                    const executor = (await import(modulePath)).default

                    if (!executor || typeof executor.execute !== 'function') {
                        throw new Error(`无法找到或执行模块: ${taskName}`)
                    }

                    updateFn(`任务 "${executor.name || taskName}" 开始执行...`)
                    const result = await executor.execute(payload, updateFn, sessionData)

                    ws.send(
                        JSON.stringify({
                            event: 'end',
                            taskId,
                            success: true,
                            data: result,
                            message: result.message || '任务成功完成'
                        })
                    )
                } catch (error) {
                    console.error(`[Task Execution] 任务 ${taskId} (${taskName}) 执行失败:`, error)
                    const errorMessage = error.message || '未知错误'
                    updateFn(`错误: ${errorMessage}`, 'error')
                    ws.send(JSON.stringify({ event: 'end', taskId, success: false, message: errorMessage }))
                }
            }
        } catch (e) {
            console.error('[WebSocket] 无法解析消息或消息格式错误:', e)
        }
    })

    ws.on('close', () => {
        clients.delete(sessionId)
        console.log(`[WebSocket] 客户端已断开, Session ID: ${sessionId}`)
    })
})

// --- 启动服务器 ---
const PORT = process.env.PORT || 2333
server.listen(PORT, () => {
    console.log(`后端服务已启动在 http://localhost:${PORT}`)
}) 
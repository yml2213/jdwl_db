import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import session from 'express-session'
import FileStoreFactory from 'session-file-store'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'

import * as jdApiService from './services/jdApiService.js'

// --- 基本设置 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

// --- 会话管理 ---
const FileStore = FileStoreFactory(session)
const sessionMiddleware = session({
    store: new FileStore({
        path: path.join(__dirname, '..', 'sessions'),
        logFn: function () { } // 禁用日志
    }),
    secret: 'your-secret-key', // 请替换为更安全的密钥
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // 如果使用HTTPS，应设置为true
        maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
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
app.use(express.static('public'))

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

// --- 动态加载任务和流程处理器 ---
const loadHandlers = async (dir, suffix) => {
    const handlers = {}
    const handlerDir = path.join(__dirname, dir)
    try {
        const files = await fs.readdir(handlerDir)
        for (const file of files) {
            if (file.endsWith(suffix)) {
                const handlerName = file.replace(suffix, '')
                const modulePath = path.join(handlerDir, file)
                // 使用 file:// URL 格式进行动态导入
                const moduleUrl = new URL(`file://${modulePath}`)
                const handlerModule = await import(moduleUrl.href)
                handlers[handlerName] = handlerModule.default
            }
        }
    } catch (error) {
        console.error(`加载处理器失败 ${dir}:`, error)
    }
    return handlers
}

let taskHandlers = {}
let flowHandlers = {}

// WebSocket 消息处理
const handleWebSocketMessage = async (ws, message) => {
    const { action, taskId, taskName, isFlow, payload, sessionId } = JSON.parse(message)

    if (action === 'start_task') {
        const session = await restoreSession(sessionId)
        if (!session) {
            ws.send(
                JSON.stringify({
                    event: 'end',
                    taskId,
                    success: false,
                    message: '无法恢复会话, 请重新登录'
                })
            )
            return
        }

        const log = (logMessage) => {
            console.log(`[Task: ${taskId}] ${logMessage}`)
            ws.send(JSON.stringify({ event: 'log', taskId, data: logMessage }))
        }

        try {
            const handler = isFlow ? flowHandlers[taskName] : taskHandlers[taskName]
            if (handler) {
                const result = await handler(payload, session, log)
                ws.send(
                    JSON.stringify({
                        event: 'end',
                        taskId,
                        success: true,
                        data: result
                    })
                )
            } else {
                throw new Error(`未找到处理器: ${taskName}`)
            }
        } catch (error) {
            console.error(`执行任务 ${taskName} (ID: ${taskId}) 失败:`, error)
            ws.send(
                JSON.stringify({
                    event: 'end',
                    taskId,
                    success: false,
                    message: error.message
                })
            )
        }
    }
}

/**
 * @description 从会话存储中恢复会话
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
const restoreSession = async (sessionId) => {
    console.log(`[Session Restore] 1. Received raw sessionId: ${sessionId}`)
    if (!sessionId) return null

    // express-session的会话cookie是签名的，格式为 s:sessionid.signature
    // 我们需要从中提取出真正的 sessionid 作为文件名
    let sid = sessionId
    if (sid.startsWith('s:')) {
        sid = sid.slice(2)
        sid = sid.slice(0, sid.lastIndexOf('.'))
    }
    console.log(`[Session Restore] 2. Parsed sid for filename: ${sid}`)

    try {
        const sessionFilePath = path.join(__dirname, '..', 'sessions', `${sid}.json`) // 使用解析后的sid
        console.log(`[Session Restore] 3. Attempting to read file: ${sessionFilePath}`)
        const sessionData = await fs.readFile(sessionFilePath, 'utf-8')
        console.log(`[Session Restore] 4. Successfully read session file content.`)
        const session = JSON.parse(sessionData)
        console.log(
            `[Session Restore] 5. Successfully parsed session object for user:`,
            session.user?.userName
        )
        return session
    } catch (error) {
        console.error(
            `[Session Restore] FAILED. Unable to restore session for sid=${sid} (Original ID: ${sessionId}). Error:`,
            error
        )
        return null
    }
}

// --- WebSocket 服务器 ---
wss.on('connection', (ws, request) => {
    // 注意：这里我们不再从升级请求中解析会话
    // 会话ID将由每个 'start_task' 消息提供

    ws.on('message', (message) => handleWebSocketMessage(ws, message.toString()))

    ws.on('close', () => {
        // 可以在这里添加一些断开连接时的清理逻辑
        console.log(`[WebSocket] 客户端已断开`)
    })

    ws.on('error', (error) => {
        console.error('[WebSocket] 发生错误:', error)
    })
})

// --- 启动服务器 ---
server.on('upgrade', (request, socket, head) => {
    // 直接将升级请求交给WebSocket服务器处理，不做会话验证
    // 会话验证将在每个任务消息中进行
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
        console.log('[WebSocket] 客户端已连接')
    })
})

const PORT = process.env.PORT || 2333
server.listen(PORT, async () => {
    taskHandlers = await loadHandlers('tasks', '.task.js')
    flowHandlers = await loadHandlers('flows', '.flow.js')
    console.log(`后端服务已启动在 http://localhost:${PORT}`)
}) 
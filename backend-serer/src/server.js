import express from 'express'
import { fileURLToPath } from 'url'
import session from 'express-session'
import FileStore from 'session-file-store'
import { taskManager } from './utils/taskManager.js'

const FileStoreSession = FileStore(session)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// --- 导入处理器 ---
import { taskHandlers } from './handlers/taskHandlers.js'
import { flowHandlers } from './handlers/flowHandlers.js'

// --- 导入中间件 ---
import { restoreSession } from './middleware/sessionMiddleware.js'
import { authenticateWebSocket } from './middleware/websocketMiddleware.js'

// --- 导入路由 ---
import { taskRouter } from './routes/taskRouter.js'
import { flowRouter } from './routes/flowRouter.js'

// --- 导入静态文件 ---
import { staticMiddleware } from './middleware/staticMiddleware.js'

// --- 导入配置 ---
import { config } from './config/config.js'

// --- 导入日志 ---
import { logger } from './utils/logger.js'

// --- 导入错误处理 ---
import { errorHandler } from './middleware/errorHandler.js'

// --- 导入 WebSocket 服务器 ---
import { WebSocketServer } from 'ws'

// --- 导入路径 ---
import path from 'path'

// --- 导入 http 模块 ---
import http from 'http'

// --- 导入 https 模块 ---
import https from 'https'

// --- 导入证书 ---
import fs from 'fs'

// --- 导入 dotenv ---
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

// 配置日志
logger.info('Starting server...')

// 配置 Express 应用
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(session({
    store: new FileStoreSession({
        path: './sessions',
        ttl: 86400, // 24 hours
        secret: config.sessionSecret,
        logFn: (msg, data) => logger.debug(msg, data)
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.isProduction,
        httpOnly: true,
        maxAge: 86400000 // 24 hours
    }
}))

// 配置静态文件
app.use(staticMiddleware(__dirname))

// 配置路由
app.use('/api/tasks', taskRouter)
app.use('/api/flows', flowRouter)

// 配置错误处理中间件
app.use(errorHandler)

// 启动 Express 应用
const PORT = config.port || 3000
const HOST = config.host || '0.0.0.0'

const server = http.createServer(app)

// 配置 HTTPS
if (config.isProduction) {
    const httpsOptions = {
        key: fs.readFileSync(config.sslKeyPath),
        cert: fs.readFileSync(config.sslCertPath)
    }
    const httpsServer = https.createServer(httpsOptions, app)
    httpsServer.listen(config.httpsPort, HOST, () => {
        logger.info(`HTTPS server listening on port ${config.httpsPort}`)
    })
}

server.listen(PORT, HOST, () => {
    logger.info(`Server listening on port ${PORT}`)
})

// 配置 WebSocket 服务器
const wss = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
    try {
        // 验证 WebSocket 连接
        const sessionId = req.headers['x-session-id']
        if (!sessionId) {
            ws.send(JSON.stringify({ event: 'error', message: '未提供会话ID' }))
            ws.close()
            return
        }

        // 验证和恢复会话
        const session = await restoreSession(sessionId)
        if (!session) {
            ws.send(
                JSON.stringify({
                    event: 'end',
                    taskId: 'N/A', // 没有任务ID
                    success: false,
                    message: '无法恢复会话, 请重新登录'
                })
            )
            ws.close()
            return
        }

        // 验证 WebSocket 中间件
        await authenticateWebSocket(ws, session)

        // 监听消息
        ws.on('message', (message) => handleWebSocketMessage(ws, message))
        ws.on('close', () => {
            logger.info(`WebSocket connection closed for session ${sessionId}`)
            // 清理任务管理器中的任务
            taskManager.deregisterAllTasks()
        })

        logger.info(`WebSocket connection established for session ${sessionId}`)
    } catch (error) {
        logger.error(`WebSocket connection error: ${error.message}`)
        // 可选：向客户端发送一个通用错误
    }
})

// 处理 WebSocket 消息
const handleWebSocketMessage = async (ws, message) => {
    try {
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

            // 注册任务并获取取消令牌
            const cancellationToken = taskManager.registerTask(taskId)

            const log = (logMessage) => {
                // 在记录日志前检查任务是否已被取消
                if (!cancellationToken.value) {
                    // 可以选择性地发送一条“任务已取消”的日志
                    return
                }
                console.log(`[Task: ${taskId}]  日志:`, logMessage)
                // 如果是对象，直接发送；如果是字符串，包装一下
                const eventData =
                    typeof logMessage === 'object' && logMessage !== null
                        ? { event: 'log', taskId, data: logMessage }
                        : { event: 'log', taskId, data: { message: logMessage, type: 'info' } } // 保持 data 字段为对象
                ws.send(JSON.stringify(eventData))
            }

            try {
                const handlerModule = isFlow ? flowHandlers[taskName] : taskHandlers[taskName]
                if (handlerModule && typeof handlerModule.execute === 'function') {
                    // 将取消令牌传递给执行函数
                    const result = await handlerModule.execute(payload, log, session, cancellationToken)
                    let data = {
                        event: 'end',
                        taskId,
                        success: result.success,
                        data: result.message || result.msg
                    }
                    console.log(`[Task: ${taskId}] ws发送到前端数据: ${JSON.stringify(data)}`)
                    ws.send(JSON.stringify(data))
                } else {
                    throw new Error(`未找到处理器或处理器缺少 execute 方法: ${taskName}`)
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
            } finally {
                // 任务结束后注销
                taskManager.deregisterTask(taskId)
            }
        } else if (action === 'cancel_task') {
            console.log(`[WebSocket] Received cancel request for task ${taskId}`)
            taskManager.cancelTask(taskId)
        }
    } catch (error) {
        console.error(`处理WebSocket消息时出错: ${error.message}`)
        // 可选：向客户端发送一个通用错误
    }
} 
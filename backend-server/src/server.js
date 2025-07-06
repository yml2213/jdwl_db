import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import session from 'express-session'
import FileStoreFactory from 'session-file-store'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { unsign } from 'cookie-signature'
import db from './utils/db.js' // 引入数据库工具

import * as jdApiService from './services/jdApiService.js'

// --- 基本设置 ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

// --- 会话管理 ---
const FileStore = FileStoreFactory(session)
const sessionSecret = 'QWER1234asdf.!1234' // 提取会话密钥为常量
const sessionMiddleware = session({
    store: new FileStore({
        path: path.join(__dirname, '..', 'sessions'),
        logFn: function () { } // 禁用日志
    }),
    secret: sessionSecret, // 请替换为更安全的密钥
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

// 新增：获取供应商列表
app.get('/api/vendors', requireAuth, async (req, res) => {
    console.log('[API /api/vendors] 收到请求。正在处理...')
    try {
        const vendors = await jdApiService.getVendorList(req.session)
        // console.log('[API /api/vendors] 成功获取并处理了供应商数据，准备返回:', vendors)
        res.json(vendors)
    } catch (error) {
        console.error('[API /api/vendors] 获取供应商列表时发生严重错误:', error)
        if (error.message === 'NotLogin') {
            res.status(401).json({ error: 'NotLogin', message: '会话无效或已过期' })
        } else {
            res.status(500).json({ error: 'InternalServerError', message: error.message })
        }
    }
})

// 新增：获取事业部列表
app.post('/api/departments', requireAuth, async (req, res) => {
    const { vendorName } = req.body
    if (!vendorName) {
        return res.status(400).json({ error: 'BadRequest', message: '缺少 vendorName 参数' })
    }
    try {
        const departments = await jdApiService.getDepartmentList(vendorName, req.session)
        res.json(departments)
    } catch (error) {
        console.error(`获取"${vendorName}"的事业部列表失败:`, error)
        if (error.message === 'NotLogin') {
            res.status(401).json({ error: 'NotLogin', message: '会话无效或已过期' })
        } else {
            res.status(500).json({ error: 'InternalServerError', message: error.message })
        }
    }
})

// 新增：创建会话状态接口（新流程）
app.post('/api/create-session', (req, res) => {
    const { cookies } = req.body
    if (cookies && Array.isArray(cookies)) {
        // 从 cookies 中解码用户名
        const pinCookie = cookies.find((c) => c.name === 'pin')
        const username = pinCookie ? decodeURIComponent(pinCookie.value) : '未知用户'

        req.session.user = { name: username }
        req.session.jdCookies = cookies // 使用新字段 jdCookies 存储

        req.session.save((err) => {
            if (err) {
                console.error('[API /api/create-session] 会话保存失败:', err)
                return res.status(500).json({ success: false, message: 'Session save error' })
            }
            console.log(`[API /api/create-session] 会话为用户 "${username}" 创建成功。`)
            // 为保持前端兼容，动态构建 context 对象
            res.json({ success: true, message: '会话创建成功', context: { cookies: req.session.jdCookies } })
        })
    } else {
        res.status(400).json({ success: false, message: '请求体中缺少必需的 cookies 数组。' })
    }
})

// 新增：更新会话中的选择信息并确保方案ID存在
app.post('/api/update-selection', requireAuth, async (req, res) => {
    const { supplierInfo, departmentInfo } = req.body
    // console.log('[Debug] /api/update-selection body:', req.body) // 调试日志

    if (!supplierInfo || !departmentInfo) {
        return res
            .status(400)
            .json({ success: false, message: '缺少 supplierInfo 或 departmentInfo' })
    }

    // 检查 jdCookies 是否存在
    if (!req.session.jdCookies) {
        return res.status(400).json({ success: false, message: '无效的会话，找不到上下文。' })
    }

    // 1. 直接更新会话属性
    req.session.supplierInfo = supplierInfo
    req.session.departmentInfo = departmentInfo

    // 2. 更新或创建用户 uniqueKey
    const pinCookie = req.session.jdCookies?.find((c) => c.name === 'pin')
    // console.log('[Debug] Found pinCookie:', pinCookie) // 调试日志
    let uniqueKey = null
    const departmentId = departmentInfo.deptNo?.replace('CBU', '')
    if (pinCookie && departmentId) {
        uniqueKey = `${decodeURIComponent(pinCookie.value)}-${departmentId}`
        req.session.user.uniqueKey = uniqueKey
    }
    // console.log('[Debug] Generated uniqueKey:', uniqueKey) // 调试日志

    // 3. 检查并确保方案ID (operationId) 存在
    if (uniqueKey) {
        try {
            console.log(`[Session] 正在为 key "${uniqueKey}" 检查方案ID...`);
            let operationId = await db.getScheme(uniqueKey);

            if (operationId) {
                console.log(`[Session] 找到了已存在的方案ID: ${operationId}`);
                req.session.operationId = operationId;
            } else {
                console.log(`[Session] 未找到方案ID，正在调用京东API创建新的方案...`);
                try {
                    const result = await jdApiService.startSessionOperation(req.session);
                    if (result.success) {
                        operationId = result.operationId;
                        console.log(`[Session] 新方案创建成功，ID: ${operationId}`);
                        req.session.operationId = operationId;
                        // 数据库操作也应包含在try...catch中
                        await db.saveScheme(uniqueKey, operationId);
                        console.log(`[Session] 新方案ID已保存到数据库。`);
                    } else {
                        // 如果API调用本身返回了 success: false
                        console.error('[Session] 京东API报告创建新方案ID失败:', result.message || '无具体错误信息');
                    }
                } catch (apiError) {
                    // 如果jdApiService.startSessionOperation抛出了异常
                    console.error('[Session] 调用京东API创建方案ID时发生严重错误:', apiError);
                }
            }
        } catch (dbError) {
            console.error('[Session] 读写方案ID数据库时发生严重错误:', dbError);
            // 数据库错误不应中断整个登录流程，但需要记录
        }
    }

    // 4. 保存会话
    req.session.save((err) => {
        if (err) {
            console.error('[API /api/update-selection] 更新会话失败:', err)
            return res.status(500).json({ success: false, message: 'Session save error' })
        }
        console.log(`[API /api/update-selection] 成功为用户 "${req.session.user.name}" 更新选择。`)
        // 为保持前端兼容，动态构建 context 对象
        const context = {
            cookies: req.session.jdCookies,
            supplierInfo: req.session.supplierInfo,
            departmentInfo: req.session.departmentInfo,
            operationId: req.session.operationId
        }
        res.json({ success: true, message: '选择已更新', context })
    })
})

// 新增：获取详细会话状态接口
app.get('/api/session-status', (req, res) => {
    if (req.session && req.session.user && req.session.jdCookies) {
        // 为保持前端兼容，动态构建 context 对象
        const context = {
            cookies: req.session.jdCookies,
            supplierInfo: req.session.supplierInfo,
            departmentInfo: req.session.departmentInfo,
            operationId: req.session.operationId
        }
        res.json({ loggedIn: true, context })
    } else {
        res.json({ loggedIn: false, context: null })
    }
})

// 新增：获取店铺列表
app.get('/api/shops', requireAuth, async (req, res) => {
    const { deptId } = req.query;
    if (!deptId) {
        return res.status(400).json({ error: 'BadRequest', message: '缺少 deptId 查询参数' });
    }
    try {
        const shops = await jdApiService.getShopList(deptId, req.session);
        res.json(shops);
    } catch (error) {
        console.error(`获取事业部 ${deptId} 的店铺列表失败:`, error);
        if (error.message === 'NotLogin') {
            res.status(401).json({ error: 'NotLogin', message: '会话无效或已过期' });
        } else {
            res.status(500).json({ error: 'InternalServerError', message: error.message });
        }
    }
});

// 新增：获取仓库列表
app.get('/api/warehouses', requireAuth, async (req, res) => {
    const { sellerId, deptId } = req.query;
    if (!sellerId || !deptId) {
        return res.status(400).json({ error: 'BadRequest', message: '缺少 sellerId 或 deptId 查询参数' });
    }
    try {
        const warehouses = await jdApiService.getWarehouseList(sellerId, deptId, req.session);
        res.json(warehouses);
    } catch (error) {
        console.error(`获取仓库列表失败 (sellerId: ${sellerId}, deptId: ${deptId}):`, error);
        if (error.message === 'NotLogin') {
            res.status(401).json({ error: 'NotLogin', message: '会话无效或已过期' });
        } else {
            res.status(500).json({ error: 'InternalServerError', message: error.message });
        }
    }
});

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
 * @param {string} sessionId - 从客户端获取的会话ID
 * @returns {Promise<object|null>} - 解析后的会话数据或null
 */
const restoreSession = async (sessionId) => {
    const sessionPath = path.join(__dirname, '..', 'sessions');
    const fileStore = new FileStore({ path: sessionPath });

    console.log(`[Session Restore] 1. Received raw cookie value: ${sessionId}`);

    try {
        const decodedCookie = decodeURIComponent(sessionId);
        console.log(`[Session Restore] 2. Decoded cookie value: ${decodedCookie}`);

        if (!decodedCookie.startsWith('s:')) {
            console.error(`[Session Restore] FAILED. Cookie does not look like a signed session cookie.`);
            return null;
        }

        // The cookie value is "s:sid.signature", unsign needs "sid.signature"
        const signedSid = decodedCookie.substring(2);

        // Unsign the cookie to get the raw session ID
        const rawSid = unsign(signedSid, sessionSecret);

        console.log(`[Session Restore] 3. Unsigned to get raw SID: ${rawSid}`);

        if (!rawSid) {
            console.error(`[Session Restore] FAILED. Cookie signature is invalid.`);
            return null;
        }

        return new Promise((resolve, reject) => {
            fileStore.get(rawSid, (err, session) => {
                if (err) {
                    console.error(`[Session Restore] FAILED to get session from store for sid=${rawSid}. Error:`, err);
                    return reject(err);
                }
                if (!session) {
                    console.log(`[Session Restore] No session found for sid=${rawSid}.`);
                    return resolve(null);
                }
                console.log(`[Session Restore] Successfully restored session for sid=${rawSid}.`);
                resolve(session);
            });
        });
    } catch (error) {
        console.error(`[Session Restore] FAILED. Unexpected error during session restoration for cookie=${sessionId}. Error:`, error);
        throw error;
    }
};

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
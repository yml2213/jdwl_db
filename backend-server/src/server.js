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
import { taskManager } from './utils/taskManager.js'
import { executeWorkflow } from './utils/workflowOrchestrator.js'

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
    // 获取会话ID，用于后续删除会话文件
    const sessionId = req.sessionID
    console.log(`[API /api/logout] 收到登出请求，会话ID: ${sessionId}`)

    // 获取会话存储路径
    const sessionPath = path.join(__dirname, '..', 'sessions')
    const sessionFile = path.join(sessionPath, `${sessionId}.json`)

    // 销毁会话对象
    req.session.destroy(async (err) => {
        if (err) {
            console.error('[API /api/logout] 销毁会话对象失败:', err)
            return res.status(500).json({ success: false, message: '登出过程中发生错误' })
        }

        // 尝试删除会话文件
        try {
            // 检查文件是否存在
            const fileExists = await fs.access(sessionFile).then(() => true).catch(() => false)

            if (fileExists) {
                await fs.unlink(sessionFile)
                console.log(`[API /api/logout] 已删除会话文件: ${sessionFile}`)
            } else {
                console.log(`[API /api/logout] 会话文件不存在: ${sessionFile}`)
            }

            res.json({ success: true, message: '登出成功，会话已完全清除' })
        } catch (fileError) {
            console.error('[API /api/logout] 删除会话文件失败:', fileError)
            // 即使删除文件失败，也返回登出成功，因为会话对象已被销毁
            res.json({ success: true, message: '登出成功，但会话文件删除失败' })
        }
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
    const { deptId, shopName } = req.query;
    console.log('req.query', req.query);
    console.log('deptId', deptId);
    console.log('shopName', shopName);
    if (!deptId) {
        return res.status(400).json({ error: 'BadRequest', message: '缺少 deptId 查询参数' });
    }
    try {
        const shops = await jdApiService.getShopList(deptId, shopName, req.session);
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

// WebSocket 消息处理
const handleWebSocketMessage = async (ws, message) => {
    // 提取 taskId 用于在发生意外错误时也能通知前端
    let taskId;
    try {
        const parsedMessage = JSON.parse(message)
        taskId = parsedMessage.taskId; // 尽早获取taskId
        const { action, payload, sessionId } = parsedMessage

        // 核心重构：创建一个全能的 updateFn，所有与前端的任务通信都通过它
        const updateFn = (data) => {
            let messageObject;

            if (typeof data === 'string') {
                // 如果传入的是字符串，包装成标准日志对象
                messageObject = { event: 'log', message: data, type: 'info', timestamp: new Date().toISOString() };
            } else if (typeof data === 'object' && data !== null) {
                // 如果是对象，确保它有 event 属性和 timestamp
                messageObject = { 
                    event: 'log', 
                    timestamp: new Date().toISOString(),
                    ...data 
                }; // 默认 event 是 'log'，timestamp 会被 data 中的值覆盖（如果有）
            } else {
                // 对于其他意外类型，记录一个警告
                console.warn(`[UpdateFn] Received data of unexpected type: ${typeof data}`);
                messageObject = { 
                    event: 'log', 
                    message: `警告: 收到意外的数据类型 ${typeof data}`, 
                    type: 'warn',
                    timestamp: new Date().toISOString()
                };
            }

            // 最后，为所有消息统一添加 taskId 并发送
            try {
                ws.send(JSON.stringify({ ...messageObject, taskId }));
            } catch (e) {
                console.error(`[UpdateFn] 发送 WebSocket 消息失败:`, e)
            }
        }


        if (action === 'execute_workflow') {
            const session = await restoreAndValidateSession(sessionId) // <-- 重命名函数调用
            if (!session) {
                updateFn({ event: 'end', success: false, message: '无法恢复或验证会话, 请重新登录并选择部门' });
                return
            }

            // 从 payload 中解构出工作流和初始上下文
            const { stages, initialContext } = payload;
            if (!stages || !Array.isArray(stages) || stages.length === 0) {
                throw new Error('无效的工作流：阶段(stages)列表不能为空。');
            }

            const cancellationToken = taskManager.registerTask(taskId, ws)

            try {
                // 直接调用通用编排器
                const result = await executeWorkflow({
                    stages, // 使用新的 stages 结构
                    taskHandlers,
                    initialContext, // initialContext 已经包含了所需的一切
                    updateFn,
                    sessionData: session,
                    cancellationToken
                });

                // 任务自然结束后，检查是否是因为取消而结束
                if (!cancellationToken.value) {
                    console.log(`[Task: ${taskId}] Workflow stopped due to cancellation.`)
                    updateFn({ event: 'end', success: false, message: '工作流已被用户取消。' });
                } else {
                    updateFn({
                        event: 'end',
                        success: result.success,
                        data: result.message || result.msg // 'data' 字段用于最终结果
                    });
                }
            } catch (error) {
                // 发生错误时也检查是否是因取消任务导致
                if (!cancellationToken.value) {
                    console.log(`[Task: ${taskId}] Workflow was cancelled, ignoring subsequent error.`)
                    updateFn({ event: 'end', success: false, message: '工作流已被用户取消。' });
                } else {
                    console.error(`执行工作流 (ID: ${taskId}) 失败:`, error)
                    updateFn({ event: 'end', success: false, message: error.message });
                }
            } finally {
                taskManager.deregisterTask(taskId)
            }
        } else if (action === 'cancel_task') {
            console.log(`[WebSocket] Received cancel request for task ${taskId}`)
            taskManager.cancelTask(taskId)
            updateFn({ message: '取消请求已发送...', type: 'warn' });
        }
    } catch (error) {
        console.error('处理WebSocket消息时发生未知错误:', error)
        // 尝试向客户端发送一个通用错误
        if (taskId) {
            ws.send(JSON.stringify({
                event: 'end',
                taskId,
                success: false,
                message: `服务器处理消息时发生未知错误: ${error.message}`
            }));
        }
    }
}

/**
 * @description 从会话存储中恢复会话
 * @param {string} sessionId - 从客户端获取的会话ID
 * @returns {Promise<object|null>} - 解析后的会话数据或null
 */
const restoreAndValidateSession = async (sessionId) => {
    const sessionPath = path.join(__dirname, '..', 'sessions');
    const fileStore = new FileStore({ path: sessionPath });

    console.log(`[会话恢复] 1. 收到原始cookie值: ${sessionId}`);

    try {
        const decodedCookie = decodeURIComponent(sessionId);
        const signedSid = decodedCookie.startsWith('s:') ? decodedCookie.substring(2) : null;
        if (!signedSid) {
            console.error(`[会话恢复] 失败。Cookie不是一个有效的签名会话cookie。`);
            return null;
        }

        const rawSid = unsign(signedSid, sessionSecret);
        if (!rawSid) {
            console.error(`[会话恢复] 失败。Cookie签名无效。`);
            return null;
        }
        console.log(`[会话恢复] 2. 成功解签名，获得原始会话ID: ${rawSid}`);


        let session = await new Promise((resolve, reject) => {
            fileStore.get(rawSid, (err, sessionData) => {
                if (err) return reject(err);
                resolve(sessionData);
            });
        });

        if (!session) {
            console.log(`[会话恢复] 未找到会话文件，会话ID=${rawSid}。`);
            return null;
        }
        console.log(`[会话恢复] 3. 成功从存储中恢复会话。`);

        // --- 核心验证与修复逻辑 ---
        console.log('[会话验证] 4. 开始验证会话的完整性...');

        // 检查执行工作流所需的最基本信息
        if (!session.jdCookies || !session.supplierInfo || !session.departmentInfo) {
            console.error('[会话验证] 失败。会话缺少 jdCookies, supplierInfo, 或 departmentInfo。');
            return null; // 返回null，让调用者通知前端重新选择
        }

        const pinCookie = session.jdCookies.find((c) => c.name === 'pin');
        const departmentId = session.departmentInfo.deptNo?.replace('CBU', '');

        if (!pinCookie || !departmentId) {
            console.error('[会话验证] 失败。无法从会话中构造 uniqueKey。');
            return null;
        }

        const uniqueKey = `${decodeURIComponent(pinCookie.value)}-${departmentId}`;
        console.log(`[会话验证] 5. 生成的 uniqueKey: "${uniqueKey}"`);

        try {
            let operationId = await db.getScheme(uniqueKey);

            if (operationId) {
                console.log(`[会话验证] 6a. 从数据库找到已存在的方案ID: ${operationId}`);
                session.operationId = operationId;
            } else {
                console.log(`[会话验证] 6b. 未找到方案ID，调用京东API创建新方案...`);
                const result = await jdApiService.startSessionOperation(session);
                if (result.success) {
                    operationId = result.operationId;
                    console.log(`[会话验证] 7. 新方案创建成功，ID: ${operationId}`);
                    session.operationId = operationId;

                    // 将新ID异步保存到数据库和会话文件，不阻塞当前流程
                    db.saveScheme(uniqueKey, operationId)
                        .then(() => console.log(`[会话验证] 新方案ID已保存到数据库。`))
                        .catch(dbErr => console.error('[会话验证] 新方案ID保存到数据库失败:', dbErr));

                    fileStore.set(rawSid, session, (err) => {
                        if (err) {
                            console.error('[会话验证] 更新会话文件失败:', err);
                        } else {
                            console.log('[会话验证] 已将新方案ID更新到会话文件。');
                        }
                    });

                } else {
                    console.error('[会话验证] 京东API报告创建新方案失败:', result.message || '无具体错误信息');
                    // 如果创建失败，这是一个严重问题，可能JD服务暂时不可用
                    return null;
                }
            }
            console.log(`[会话验证] 8. 会话验证成功，最终方案ID: ${session.operationId}`);
            return session;

        } catch (error) {
            console.error('[会话验证] 在检查或创建方案ID时发生严重错误:', error);
            return null; // 出现任何错误都认为验证失败
        }
        // --- 核心验证与修复逻辑结束 ---

    } catch (error) {
        console.error(`[会话恢复] 失败。在恢复和验证会话过程中发生意外错误:`, error);
        return null; // 修改：在顶层catch中返回null而不是抛出异常
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
        taskManager.cleanup(ws); // 当WebSocket连接关闭时，取消该连接下的所有任务
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
    console.log(`后端服务已启动在 http://localhost:${PORT}`)
}) 
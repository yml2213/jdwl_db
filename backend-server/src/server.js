import express from 'express'
import cors from 'cors'
import { JSONFilePreset } from 'lowdb/node'
import { v4 as uuidv4 } from 'uuid'

const app = express()
const port = 3000

// 初始化 lowdb
const defaultData = { sessions: [] }
const db = await JSONFilePreset('db.json', defaultData)

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
    const { uniqueKey, cookies, supplierInfo, departmentInfo } = req.body

    if (!uniqueKey || !cookies || !supplierInfo || !departmentInfo) {
        return res.status(400).json({ message: 'Missing session data.' })
    }

    // 查找是否已存在该用户的会话
    const existingSessionIndex = db.data.sessions.findIndex(s => s.uniqueKey === uniqueKey)

    if (existingSessionIndex > -1) {
        // 如果存在，更新会话信息
        console.log(`Updating session for uniqueKey: ${uniqueKey}`)
        const existingSession = db.data.sessions[existingSessionIndex]
        existingSession.cookies = cookies
        existingSession.supplierInfo = supplierInfo
        existingSession.departmentInfo = departmentInfo
        existingSession.updatedAt = new Date().toISOString()

        await db.write()
        res.status(200).json({ sessionId: existingSession.sessionId })

    } else {
        // 如果不存在，创建新会话
        console.log(`Creating new session for uniqueKey: ${uniqueKey}`)
        const sessionId = uuidv4()
        const newSession = {
            sessionId,
            uniqueKey,
            cookies,
            supplierInfo,
            departmentInfo,
            createdAt: new Date().toISOString(),
        }

        db.data.sessions.push(newSession)
        await db.write()
        res.status(200).json({ sessionId })
    }
})


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`)
}) 
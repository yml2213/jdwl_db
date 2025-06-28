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
    const { cookies, supplierInfo, departmentInfo } = req.body

    if (!cookies || !supplierInfo || !departmentInfo) {
        return res.status(400).json({ message: 'Missing session data.' })
    }

    const sessionId = uuidv4()
    const newSession = {
        sessionId,
        cookies,
        supplierInfo,
        departmentInfo,
        createdAt: new Date().toISOString(),
    }

    // 将新会话存入数据库
    db.data.sessions.push(newSession)
    await db.write()

    console.log(`Session created with ID: ${sessionId}`)

    // 将 sessionId 返回给前端
    res.status(200).json({ sessionId })
})


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`)
}) 
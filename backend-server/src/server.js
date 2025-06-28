const express = require('express')
const cors = require('cors')

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
app.post('/api/session', (req, res) => {
    const { cookies, supplierInfo, departmentInfo } = req.body

    console.log('Received session data:')
    console.log('Cookies:', cookies)
    console.log('Supplier Info:', supplierInfo)
    console.log('Department Info:', departmentInfo)

    // TODO: 在此处添加逻辑来安全地存储和管理这些信息
    // 例如，可以创建一个会话ID，将这些信息存入数据库或缓存（如Redis），
    // 然后将该会d话ID返回给前端。

    res.status(200).json({ message: 'Session data received successfully.' })
})


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`)
}) 
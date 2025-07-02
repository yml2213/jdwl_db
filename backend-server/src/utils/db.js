import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 数据库文件将存储在 backend-server/db.json
const file = path.join(__dirname, '..', '..', 'db.json')

const adapter = new JSONFile(file)
// 设置数据库的默认结构
const defaultData = { schemes: {} }
const db = new Low(adapter, defaultData)

// 读取数据，如果文件不存在，则会创建并使用默认数据
await db.read()

export default db 
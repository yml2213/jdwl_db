import { EventEmitter } from 'events'

const WS_URL = 'ws://47.93.132.204:2333' // 请根据您的后端地址进行修改

class WebSocketService extends EventEmitter {
    constructor() {
        super()
        this.connection = null
        this.reconnectInterval = 5000 // 5秒重连间隔
        this.shouldReconnect = true
    }

    connect() {
        console.log('[WebSocket] 正在连接...')
        this.shouldReconnect = true
        this.connection = new WebSocket(WS_URL)

        this.connection.onopen = () => {
            console.log('[WebSocket] 连接成功！')
            this.emit('open')
        }

        this.connection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data)
                this.emit('message', message)
            } catch (error) {
                console.error('[WebSocket] 解析消息失败:', error)
            }
        }

        this.connection.onclose = () => {
            console.log('[WebSocket] 连接已关闭。')
            this.emit('close')
            if (this.shouldReconnect) {
                setTimeout(() => this.connect(), this.reconnectInterval)
            }
        }

        this.connection.onerror = (error) => {
            console.error('[WebSocket] 发生错误:', error)
            this.emit('error', error)
            // onerror 通常也会触发 onclose，所以重连逻辑会在 onclose 中处理
        }
    }

    send(data) {
        if (this.connection && this.connection.readyState === WebSocket.OPEN) {
            this.connection.send(JSON.stringify(data))
        } else {
            console.error('[WebSocket] 连接未打开，无法发送消息:', data)
        }
    }

    close() {
        this.shouldReconnect = false
        if (this.connection) {
            this.connection.close()
        }
    }
}

// 创建并导出一个单例
const webSocketService = new WebSocketService()
export default webSocketService 
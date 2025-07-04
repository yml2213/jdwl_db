// A simple, browser-compatible EventEmitter.
class BrowserEventEmitter {
    constructor() {
        this.callbacks = {}
    }

    on(event, cb) {
        if (!this.callbacks[event]) this.callbacks[event] = []
        this.callbacks[event].push(cb)
    }

    off(event, cb) {
        const callbacks = this.callbacks[event]
        if (callbacks) {
            this.callbacks[event] = callbacks.filter((c) => c !== cb)
        }
    }

    emit(event, ...args) {
        const callbacks = this.callbacks[event]
        if (callbacks) {
            callbacks.forEach((cb) => cb(...args))
        }
    }
}

import { API_BASE_URL } from './apiService' // 引入统一的 API 地址

// 根据 API_BASE_URL 动态生成 WebSocket URL
// 这会自动处理 http -> ws 和 https -> wss 的转换
const WS_URL = API_BASE_URL.replace(/^http/, 'ws')

class WebSocketService extends BrowserEventEmitter {
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
import { EventEmitter } from 'events'
import pino from 'pino'

// 创建一个基础的 Pino logger 实例
// 在开发环境中，使用 pino-pretty 来美化输出
const rootLogger = pino({
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname,taskId' // 在控制台输出中忽略这些字段
        }
    }
})

// 创建一个事件发射器，用于将日志推送到前端
const logEmitter = new EventEmitter()

/**
 * 为特定任务创建一个上下文感知的日志记录器。
 * @param {string} taskId - 与日志关联的任务ID。
 * @param {string} taskName - 任务的名称，将作为日志的上下文。
 * @returns {object} 返回一个包含 logger 实例和 emitter 的对象。
 */
function createLogger(taskId, taskName = 'global') {
    // 为每个任务创建一个子 logger，自动包含 taskId 和 taskName
    const childLogger = rootLogger.child({ taskId, taskName })

    // 创建一个通用的日志函数，它会同时写入日志并发送到前端
    const log = (message, type = 'info', data = {}) => {
        // 将 'success' 映射到 'info'，因为 pino 没有 success 级别
        const pinoLevel = type === 'success' ? 'info' : type

        // 确保 pinoLevel 是一个有效的 pino 方法，以防传入其他无效类型
        if (typeof childLogger[pinoLevel] === 'function') {
            childLogger[pinoLevel]({ ...data, msg: message })
        } else {
            // 对于任何其他未知的类型，默认使用 'info' 级别记录
            childLogger.info({ ...data, msg: message, originalType: type })
        }

        // 准备要发送到前端的日志数据，这里我们保留原始的 'type'
        const logData = {
            message,
            type,
            timestamp: new Date().toISOString()
        }

        // 通过 emitter 发送日志，供 SSE 使用
        logEmitter.emit(taskId, logData)
    }

    // 创建一个简化的 updateFn，兼容旧的任务函数签名
    const updateFn = (status, type = 'info') => {
        const message = typeof status === 'string' ? status : status.message || JSON.stringify(status)
        const logType = status.error ? 'error' : type
        log(message, logType)
    }


    return {
        info: (message, data) => log(message, 'info', data),
        warn: (message, data) => log(message, 'warn', data),
        error: (message, data) => log(message, 'error', data),
        debug: (message, data) => log(message, 'debug', data),
        log, // 直接暴露 log 函数，提供更大的灵活性
        updateFn // 暴露兼容旧接口的函数
    }
}

// 暴露 emitter，以便服务器可以监听事件
export const events = logEmitter

// 暴露创建器
export default {
    createLogger
} 
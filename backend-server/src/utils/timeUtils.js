/**
 * @description 时间相关的工具函数
 */

/**
 * 获取格式化的中国时区时间戳
 * @returns {string} 格式为 'YYYY-MM-DD_HH-mm-SS' 的时间字符串
 */
export function getFormattedChinaTime() {
    const date = new Date()
    // 创建一个新的Date对象，它表示的时间是当前UTC时间加上8小时
    const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)

    // 使用 getUTC* 方法从这个新的Date对象中提取时间部分
    // 这样可以确保我们得到的是UTC+8时区的时间，而忽略服务器本身的任何时区设置
    const year = chinaTime.getUTCFullYear()
    const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0')
    const day = String(chinaTime.getUTCDate()).padStart(2, '0')
    const hours = String(chinaTime.getUTCHours()).padStart(2, '0')
    const minutes = String(chinaTime.getUTCMinutes()).padStart(2, '0')
    const seconds = String(chinaTime.getUTCSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

// console.log('getFormattedChinaTime() --', getFormattedChinaTime())
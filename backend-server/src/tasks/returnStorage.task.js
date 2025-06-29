/**
 * 后端任务：退货入库 (骨架)
 * TODO: 此功能的具体实现未知，暂时只记录日志。
 */
async function execute(context, sessionData) {
  const { orderNumber, year, store } = context
  console.log(
    `[Task: returnStorage] 接收到退货入库请求，订单号: ${orderNumber}, 年份: ${year}, 店铺: ${store.shopName}`
  )

  // 抛出一个明确的、信息性的错误，而不是让它无声地"成功"
  throw new Error('退货入库功能尚未实现。')

  // return { success: true, message: '任务已接收，但功能暂未实现。' }
}

export default {
  name: 'returnStorage',
  description: '退货入库',
  execute: execute
} 
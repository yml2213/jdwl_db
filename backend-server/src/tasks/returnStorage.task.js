/**
 * 后端任务：退货入库
 * 遵循三步流程：
 * 1. 根据订单号查询 CLS 编号
 * 2. 根据 CLS 编号查询订单详情
 * 3. 提交退货入库请求
 */
import {
  queryClsNoByOrderNo,
  queryOrderDetailsByClsNo,
  submitReturnOrder
} from '../services/jdApiService.js'

async function execute(context, sessionData) {
  const { orderNumber, year, returnReason, store } = context

  console.log(
    `[Task: returnStorage] 开始退货入库流程，订单号: ${orderNumber}, 年份: ${year}, 店铺: ${store.shopName}`
  )

  // Step 1: Query CLS number by order number
  console.log(`[Task: returnStorage] 步骤1: 查询CLS编号...`)
  const clsNo = await queryClsNoByOrderNo(orderNumber, year, sessionData)
  if (!clsNo) {
    throw new Error('未能根据订单号找到CLS编号。')
  }
  console.log(`[Task: returnStorage] 成功获取CLS编号: ${clsNo}`)

  // Step 2: 根据 CLS 编号查询订单详情  https://o.jdl.com/rtw/getOrder.do?rand=0.25937037832834453
  console.log(`[Task: returnStorage] 步骤2: 查询订单详情...`)
  const orderDetails = await queryOrderDetailsByClsNo(clsNo, sessionData)

  console.log('查询订单详情 ===>', orderDetails)
  if (!orderDetails || !orderDetails.rtwItems || orderDetails.rtwItems.length === 0) {
    throw new Error('未能获取订单详情或订单中没有商品。')
  }
  console.log(
    `[Task: returnStorage] 成功获取订单详情，包含 ${orderDetails.rtwItems.length} 个商品。`
  )

  // Step 3: Submit the return order
  console.log(`[Task: returnStorage] 步骤3: 提交退货入库...`)
  const submissionPayload = {
    soNo: clsNo,
    deptNo: orderDetails.deptNo,
    reason: returnReason || '',
    waybill: '', // Assuming waybill is not provided from the frontend
    rtwItems: orderDetails.rtwItems.map((item) => ({
      goodsNo: item.goodsNo,
      applyInstoreQty: item.shouldInstoreQty, // Use shouldInstoreQty for full return
      remark: ''
    }))
  }

  const result = await submitReturnOrder(submissionPayload, sessionData)
  console.log(`[Task: returnStorage] 退货入库提交成功。`)

  return {
    success: true,
    message: result.message || '退货入库成功提交。'
  }
}

export default {
  name: 'returnStorage',
  description: '退货入库',
  execute: execute
} 
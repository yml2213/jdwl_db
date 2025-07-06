/**
 * 后端任务： 退货入库   322686475212 测试订单
 * 遵循三步流程： 
 * 1. 根据订单号查询 CLS 编号
 * 2. 根据 CLS 编号查询订单详情
 * 3. 提交退货入库请求
 */
import * as jdApiService from '../services/jdApiService.js'
import logService from '../utils/logService.js'

async function execute(context, sessionData) {
  const { orderNumber, year, returnReason, updateFn } = context

  updateFn(`开始退货入库流程，订单号: ${orderNumber}, 年份: ${year}`)

  // Step 1: Query CLS number by order number
  updateFn(`步骤1: 查询CLS编号...`)
  const clsNo = await jdApiService.queryClsNoByOrderNo(orderNumber, year, sessionData)
  if (!clsNo) {
    const msg = '未能根据订单号找到CLS编号。'
    updateFn(msg, 'error')
    throw new Error(msg)
  }
  updateFn(`成功获取CLS编号: ${clsNo}`)

  // Step 2: 根据 CLS 编号查询订单详情  https://o.jdl.com/rtw/getOrder.do?rand=0.25937037832834453
  updateFn(`步骤2: 查询订单详情...`)
  const orderDetails = await jdApiService.queryOrderDetailsByClsNo(clsNo, sessionData)

  if (!orderDetails || !orderDetails.deptNo || orderDetails.aaData.length == 0) {
    const msg = '未能获取订单详情或订单中没有商品。'
    updateFn(msg, 'error')
    throw new Error(msg)
  }

  // Step 3: Submit the return order
  // {
  //   resultCode: 2,
  //     resultMessage: '退货单已存在',
  //   resultData: 'CSR4418078906881'
  // }


  updateFn(`步骤3: 提交退货入库...`)
  const submissionPayload = {
    soNo: clsNo,
    deptNo: orderDetails.deptNo,
    reason: returnReason || '',
    waybill: '',
    rtwItems: [
      {
        goodsNo: orderDetails.aaData[0].goodsNo,
        applyInstoreQty: 1,
        remark: ''
      }
    ]
  }

  const result = await jdApiService.submitReturnOrder(submissionPayload, sessionData)
  updateFn(`退货入库提交成功。`)
  updateFn(`提交退货入库 ===> ${JSON.stringify(result)}`)

  if (result.resultCode == 2) {
    return {
      success: false,
      message: result.resultMessage || '退货入库失败。'
    }
  }
  if (result.resultCode == 0) {
    return {
      success: true,
      message: result.message || '退货入库成功提交。'
    }
  }
}


export default {
  name: 'returnStorage',
  description: '退货入库',
  execute: execute
}

/**
 * 后端任务： 退货入库   322686475212 测试订单
 * 遵循流程： 
 * 1. 根据订单号查询 是否有退货入库单
 * 2. 如果有，则直接 执行 transferRtw  下发订单
 * 3. 如果没有，则执行退货入库流程
 * 3.1 根据订单号查询 CLS 编号
 * 3.2 根据 CLS 编号查询订单详情
 * 3.3 提交退货入库请求
 * 3.4 根据订单号查询 第二次是否有退货入库单
 * 3.5 如果第二次有，则直接 执行 transferRtw  下发订单
 * 
 */
import * as jdApiService from '../services/jdApiService.js'

async function execute(context, sessionData) {
  const { orderNumber, year, returnReason, updateFn } = context

  updateFn(`开始退货入库流程，订单号: ${orderNumber}, 年份: ${year}`)

  // 1. 根据订单号查询 是否有退货入库单
  updateFn(`步骤1: 查询是否有退货入库单...`)
  const hasRtw = await jdApiService.queryRtwByOrderNo(orderNumber, sessionData)
  console.log('hasRtw---->', hasRtw)

  if (hasRtw && hasRtw.length > 0) {
    updateFn(`订单号: ${orderNumber} 已存在退货入库单，直接执行 transferRtw 下发订单`)
    // 执行 transferRtw 下发订单
    const transferRtw = await jdApiService.transferRtw(hasRtw, sessionData)

    if (transferRtw.resultCode == 4) {
      updateFn(`退货入库单下发成功`)
      return {
        success: true,
        message: `订单号: ${orderNumber} 已存在退货入库单，下发成功`
      }
    } else {
      updateFn(`退货入库单下发失败`)
      return {
        success: false,
        message: `订单号: ${orderNumber} 已存在退货入库单，下发失败`
      }
    }
  } else {
    updateFn(`订单号: ${orderNumber} 不存在退货入库单，执行退货入库流程`)

    // 3.1 根据订单号查询 CLS 编号
    updateFn(`步骤1: 查询CLS编号...`)
    const clsNo = await jdApiService.queryClsNoByOrderNo(orderNumber, year, sessionData)
    if (!clsNo) {
      const msg = '未能根据订单号找到CLS编号。'
      updateFn(msg, 'error')
      throw new Error(msg)
    }
    updateFn(`成功获取CLS编号: ${clsNo}`)

    // 3.2 根据 CLS 编号查询订单详情
    updateFn(`步骤2: 查询订单详情...`)
    const orderDetails = await jdApiService.queryOrderDetailsByClsNo(clsNo, sessionData)
    console.log('orderDetails---->', orderDetails)

    if (!orderDetails || !orderDetails.deptNo || orderDetails.aaData.length == 0) {
      const msg = '未能获取订单详情或订单中没有商品。'
      updateFn(msg, 'error')
      throw new Error(msg)
    }

    // 3.3 提交退货入库请求
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
    // updateFn(`退货入库提交成功。`)
    // updateFn(`提交退货入库 ===> ${JSON.stringify(result)}`)

    // 3.4 根据订单号查询 第二次是否有退货入库单  ---- 查询 提交退货入库 是否成功
    updateFn(`步骤3.4 : 查询 提交退货入库 是否成功...`)
    const hasRtw2 = await jdApiService.queryRtwByOrderNo(orderNumber, sessionData)
    console.log('hasRtw2---->', hasRtw2)

    if (hasRtw2 && hasRtw2.length > 0) {
      updateFn(`订单号: ${orderNumber} 提交退货入库成功，执行 transferRtw 下发订单`)
      // 执行 transferRtw 下发订单
      const transferRtw2 = await jdApiService.transferRtw(hasRtw2, sessionData)

      if (transferRtw2.resultCode == 4) {
        updateFn(`退货入库单下发成功`)
        return {
          success: true,
          message: `订单号: ${orderNumber} 提交退货入库成功，下发成功`
        }
      } else {
        updateFn(`退货入库单下发失败`)
        return {
          success: false,
          message: `订单号: ${orderNumber} 提交退货入库成功，下发失败`
        }
      }
    }
  }
}


export default {
  name: 'returnStorage',
  description: '退货入库',
  execute: execute
}


// Step 3: Submit the return order
// {
//   resultCode: 2,
//     resultMessage: '退货单已存在',
//   resultData: 'CSR4418078906881'
// }

// 提交退货入库 ===> {"resultCode":1,"resultMessage":"操作成功！","resultData":"CSR4418072989911"}
/**
 * 退货入库功能模块
 */
import { fetchApi } from '../../services/apiService'
import qs from 'qs'

// API基础URL
const BASE_URL = 'https://o.jdl.com'

/**
 * 根据单号查询CLS订单信息
 * @param {string} orderNumber - 订单号
 * @param {string} year - 年份
 * @returns {Promise<Object>} 查询结果
 */
export async function queryOrderByNumber(orderNumber, year) {
  if (!orderNumber) {
    throw new Error('订单号不能为空')
  }

  console.log(`开始查询订单: ${orderNumber}, 年份: ${year}`)

  const url = `${BASE_URL}/so/querySoMainList.do?rand=${Math.random()}`

  // 构建请求参数
  const formData = {
    spSoNo: orderNumber, // 外部平台单号
    soYear: year || new Date().getFullYear().toString(), // 年份
    aoData: JSON.stringify([
      { name: 'sEcho', value: 5 },
      { name: 'iColumns', value: 19 },
      { name: 'sColumns', value: ',,,,,,,,,,,,,,,,,,' },
      { name: 'iDisplayStart', value: 0 },
      { name: 'iDisplayLength', value: 10 },
      { name: 'mDataProp_0', value: 0 },
      { name: 'bSortable_0', value: false },
      { name: 'mDataProp_1', value: 1 },
      { name: 'bSortable_1', value: false },
      { name: 'mDataProp_2', value: 'soNo' },
      { name: 'bSortable_2', value: true },
      { name: 'mDataProp_3', value: 'spSoNo' },
      { name: 'bSortable_3', value: true },
      { name: 'mDataProp_4', value: 'parentId' },
      { name: 'bSortable_4', value: true },
      { name: 'mDataProp_5', value: 'soType' },
      { name: 'bSortable_5', value: true },
      { name: 'mDataProp_6', value: 'soStatus' },
      { name: 'bSortable_6', value: true },
      { name: 'mDataProp_7', value: 'consignee' },
      { name: 'bSortable_7', value: true },
      { name: 'mDataProp_8', value: 'consigneeAddr' },
      { name: 'bSortable_8', value: true },
      { name: 'mDataProp_9', value: 'shopName' },
      { name: 'bSortable_9', value: true },
      { name: 'mDataProp_10', value: 'shipperName' },
      { name: 'bSortable_10', value: true },
      { name: 'mDataProp_11', value: 'wayBill' },
      { name: 'bSortable_11', value: true },
      { name: 'mDataProp_12', value: 'spCreateTime' },
      { name: 'bSortable_12', value: true },
      { name: 'mDataProp_13', value: 'createTime' },
      { name: 'bSortable_13', value: true },
      { name: 'mDataProp_14', value: 'stationName' },
      { name: 'bSortable_14', value: true },
      { name: 'mDataProp_15', value: 'chronergyStr' },
      { name: 'bSortable_15', value: true },
      { name: 'mDataProp_16', value: 'expectDeliveryDate' },
      { name: 'bSortable_16', value: true },
      { name: 'mDataProp_17', value: 'orderAmount' },
      { name: 'bSortable_17', value: true },
      { name: 'mDataProp_18', value: 'soMark' },
      { name: 'bSortable_18', value: true },
      { name: 'iSortCol_0', value: 11 },
      { name: 'sSortDir_0', value: 'desc' },
      { name: 'iSortingCols', value: 1 }
    ])
  }

  try {
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: qs.stringify(formData)
    })

    console.log('订单查询响应:', response)

    if (response && response.aaData && response.aaData.length > 0) {
      const orderInfo = response.aaData[0]
      return {
        success: true,
        data: orderInfo,
        soNo: orderInfo.soNo, // CLS单号
        spSoNo: orderInfo.spSoNo, // 外部平台单号
        shopName: orderInfo.shopName, // 店铺名称
        wayBill: orderInfo.wayBill, // 运单号
        orderAmount: orderInfo.orderAmount, // 订单金额
        message: '查询成功'
      }
    } else {
      return {
        success: false,
        message: '未找到订单信息'
      }
    }
  } catch (error) {
    console.error('查询订单失败:', error)
    throw new Error(`查询订单失败: ${error.message || '未知错误'}`)
  }
}

/**
 * 根据CLS单号获取订单商品信息
 * @param {string} soNo - CLS单号
 * @returns {Promise<Object>} 订单商品信息
 */
export async function getOrderDetails(soNo) {
  if (!soNo) {
    throw new Error('CLS单号不能为空')
  }

  console.log(`开始获取订单详情: ${soNo}`)

  const url = `${BASE_URL}/rtw/getOrder.do?rand=${Math.random()}`

  try {
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: qs.stringify({
        orderId: soNo
      })
    })

    console.log('订单详情响应:', response)

    if (response && (response.aaData || response.rtwMain)) {
      const goodsList = response.aaData || []
      const rtwMain = response.rtwMain || {}

      return {
        success: true,
        data: response,
        deptNo: response.deptNo, // 部门编号
        isvSoNo: response.isvSoNo, // 外部平台单号
        goodsList: goodsList, // 商品列表
        rtwMain: rtwMain, // 退货主单信息
        message: '获取订单详情成功'
      }
    } else {
      return {
        success: false,
        message: '获取订单详情失败或无商品信息'
      }
    }
  } catch (error) {
    console.error('获取订单详情失败:', error)
    throw new Error(`获取订单详情失败: ${error.message || '未知错误'}`)
  }
}

/**
 * 提交退货入库申请
 * @param {string} soNo - CLS单号
 * @param {string} deptNo - 部门编号
 * @param {string} reason - 退货原因
 * @param {Array} goodsItems - 商品列表 [{goodsNo, applyInstoreQty, remark}]
 * @returns {Promise<Object>} 退货申请结果
 */
export async function submitReturnStorage(soNo, deptNo, reason, goodsItems) {
  if (!soNo || !deptNo) {
    throw new Error('CLS单号和部门编号不能为空')
  }

  if (!goodsItems || !goodsItems.length) {
    throw new Error('商品列表不能为空')
  }

  console.log(`开始提交退货入库申请: ${soNo}`)

  const url = `${BASE_URL}/rtw/addRtwOrder.do`

  // 构建请求数据
  const requestData = {
    soNo: soNo,
    deptNo: deptNo,
    reason: reason || '',
    waybill: '',
    rtwItems: goodsItems.map((item) => ({
      goodsNo: item.goodsNo,
      applyInstoreQty: item.applyInstoreQty || '1',
      remark: item.remark || ''
    }))
  }

  try {
    const response = await fetchApi(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/goToMainIframe.do`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(requestData)
    })

    console.log('退货入库申请响应:', response)

    if (response && response.result === true) {
      return {
        success: true,
        data: response,
        message: response.msg || '退货入库申请提交成功'
      }
    } else {
      // 处理不同错误码的情况
      if (response && response.resultCode === 2) {
        // 退货单已存在的情况，可能是重复提交
        return {
          success: false,
          data: response,
          message: `退货单已存在: ${response.resultData || ''}，${response.resultMessage || ''}`,
          errorCode: response.resultCode
        }
      } else {
        return {
          success: false,
          data: response,
          // 优先使用resultMessage，再尝试msg字段
          message: response?.resultMessage || response?.msg || '退货入库申请提交失败',
          errorCode: response?.resultCode
        }
      }
    }
  } catch (error) {
    console.error('提交退货入库申请失败:', error)
    throw new Error(`提交退货入库申请失败: ${error.message || '未知错误'}`)
  }
}

/**
 * @description 主执行函数，符合标准执行器接口。
 * @param {object} context - 包含任务所需信息的上下文对象。
 *        - `orderNumber`: 订单号
 *        - `year`: 年份
 *        - `returnReason`: 退货原因
 *        - `store`: 店铺信息
 * @param {object} helpers - 包含 log 等辅助功能的对象。
 * @returns {Promise<object>} 包含 success 和 message 的结果对象。
 */
async function execute(context, { log }) {
  const { orderNumber, year, returnReason, store } = context

  if (!orderNumber || !store || !store.deptNo) {
    throw new Error('缺少订单号或店铺/部门信息。')
  }

  try {
    // 步骤 1: 根据订单号查询 CLS 订单
    log(`[退货入库] 步骤1: 查询订单 ${orderNumber}...`, 'info')
    const orderQueryResult = await queryOrderByNumber(orderNumber, year)
    if (!orderQueryResult.success) {
      log(`[退货入库] 查询失败: ${orderQueryResult.message}`, 'error')
      return orderQueryResult // 直接返回失败结果
    }
    const soNo = orderQueryResult.soNo
    log(`[退货入库] 查询成功，获取到CLS单号: ${soNo}`, 'success')

    // 步骤 2: 获取订单详情
    log(`[退货入库] 步骤2: 获取CLS单号 ${soNo} 的详情...`, 'info')
    const detailsResult = await getOrderDetails(soNo)
    if (!detailsResult.success) {
      log(`[退货入库] 获取详情失败: ${detailsResult.message}`, 'error')
      return detailsResult
    }
    const goodsList = detailsResult.goodsList
    log(`[退货入库] 获取详情成功，包含 ${goodsList.length} 个商品。`, 'success')

    // 步骤 3: 提交退货入库申请
    log(`[退货入库] 步骤3: 提交退货入库申请...`, 'info')
    const submitResult = await submitReturnStorage(soNo, store.deptNo, returnReason, goodsList)

    // 返回最终结果
    return submitResult
  } catch (error) {
    log(`[退货入库] 执行过程中发生严重错误: ${error.message}`, 'error')
    throw error
  }
}

export default {
  name: 'returnStorage',
  label: '退货入库',
  execute: execute
}

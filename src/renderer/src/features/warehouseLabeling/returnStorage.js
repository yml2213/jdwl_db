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
      {"name":"sEcho","value":5},
      {"name":"iColumns","value":19},
      {"name":"sColumns","value":",,,,,,,,,,,,,,,,,,"},
      {"name":"iDisplayStart","value":0},
      {"name":"iDisplayLength","value":10},
      {"name":"mDataProp_0","value":0},
      {"name":"bSortable_0","value":false},
      {"name":"mDataProp_1","value":1},
      {"name":"bSortable_1","value":false},
      {"name":"mDataProp_2","value":"soNo"},
      {"name":"bSortable_2","value":true},
      {"name":"mDataProp_3","value":"spSoNo"},
      {"name":"bSortable_3","value":true},
      {"name":"mDataProp_4","value":"parentId"},
      {"name":"bSortable_4","value":true},
      {"name":"mDataProp_5","value":"soType"},
      {"name":"bSortable_5","value":true},
      {"name":"mDataProp_6","value":"soStatus"},
      {"name":"bSortable_6","value":true},
      {"name":"mDataProp_7","value":"consignee"},
      {"name":"bSortable_7","value":true},
      {"name":"mDataProp_8","value":"consigneeAddr"},
      {"name":"bSortable_8","value":true},
      {"name":"mDataProp_9","value":"shopName"},
      {"name":"bSortable_9","value":true},
      {"name":"mDataProp_10","value":"shipperName"},
      {"name":"bSortable_10","value":true},
      {"name":"mDataProp_11","value":"wayBill"},
      {"name":"bSortable_11","value":true},
      {"name":"mDataProp_12","value":"spCreateTime"},
      {"name":"bSortable_12","value":true},
      {"name":"mDataProp_13","value":"createTime"},
      {"name":"bSortable_13","value":true},
      {"name":"mDataProp_14","value":"stationName"},
      {"name":"bSortable_14","value":true},
      {"name":"mDataProp_15","value":"chronergyStr"},
      {"name":"bSortable_15","value":true},
      {"name":"mDataProp_16","value":"expectDeliveryDate"},
      {"name":"bSortable_16","value":true},
      {"name":"mDataProp_17","value":"orderAmount"},
      {"name":"bSortable_17","value":true},
      {"name":"mDataProp_18","value":"soMark"},
      {"name":"bSortable_18","value":true},
      {"name":"iSortCol_0","value":11},
      {"name":"sSortDir_0","value":"desc"},
      {"name":"iSortingCols","value":1}
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
    rtwItems: goodsItems.map(item => ({
      goodsNo: item.goodsNo,
      applyInstoreQty: item.applyInstoreQty || "1",
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
      return {
        success: false,
        data: response,
        message: response.msg || '退货入库申请提交失败'
      }
    }
  } catch (error) {
    console.error('提交退货入库申请失败:', error)
    throw new Error(`提交退货入库申请失败: ${error.message || '未知错误'}`)
  }
}

/**
 * 完整的退货入库执行器函数
 * @param {Object} task - 任务信息
 * @param {Object} shopInfo - 店铺信息
 * @returns {Promise<Object>} 执行结果
 */
export async function executeReturnStorage(task, shopInfo) {
  try {
    // 更新任务状态为处理中
    task.状态 = '处理中'
    task.结果 = '查询订单中...'
    
    // 1. 根据单号查询订单
    const orderSearchResult = await queryOrderByNumber(task.orderNumber, task.year)
    if (!orderSearchResult.success) {
      task.状态 = '失败'
      task.结果 = orderSearchResult.message
      return { success: false, message: orderSearchResult.message }
    }
    
    task.结果 = '获取订单详情中...'
    
    // 2. 获取订单详情
    const orderDetails = await getOrderDetails(orderSearchResult.soNo)
    if (!orderDetails.success) {
      task.状态 = '失败'
      task.结果 = orderDetails.message
      return { success: false, message: orderDetails.message }
    }
    
    task.结果 = '准备提交退货申请...'
    
    // 准备商品列表
    const goodsItems = orderDetails.goodsList.map(item => ({
      goodsNo: item.goodsNo,
      applyInstoreQty: "1", // 默认为1件
      remark: ''
    }))
    
      // 3. 提交退货入库申请
     const submitResult = await submitReturnStorage(
       orderSearchResult.soNo,
       orderDetails.deptNo,
       task.returnReason || "", // 退货原因可以为空
       goodsItems
     )
    
    if (submitResult.success) {
      task.状态 = '成功'
      task.结果 = submitResult.message
      return { success: true, message: submitResult.message }
    } else {
      task.状态 = '失败'
      task.结果 = submitResult.message
      return { success: false, message: submitResult.message }
    }
  } catch (error) {
    console.error('执行退货入库任务失败:', error)
    task.状态 = '失败'
    task.结果 = `执行失败: ${error.message || '未知错误'}`
    return { success: false, message: task.结果 }
  }
} 
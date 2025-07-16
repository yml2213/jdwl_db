import { executeInBatches } from '../utils/batchProcessor.js'
import * as jdApiService from '../services/jdApiService.js'

const API_BATCH_SIZE = 100 // 接口支持最多50个
const BATCH_DELAY = 1500 // 1.5秒

/**
 * 启用商品库存分配的任务
 * @param {object} context - 来自工作流或前端的数据
 * @param {object[]} context.skus - SKU 生命周期对象数组
 * @param {object} context.store - 店铺信息
 * @param {object} context.department - 事业部信息
 */
async function execute(context, sessionData, cancellationToken = { value: true }) {
  const { updateFn, skus: skuLifecycles, store } = context

  if (!sessionData || !sessionData.jdCookies) {
    updateFn({ message: '错误：缺少会话信息。', type: 'error' })
    throw new Error('缺少会话信息')
  }

  if (!skuLifecycles || skuLifecycles.length === 0) {
    updateFn({ message: '没有需要处理的商品数据。', type: 'info' })
    return { success: true, message: '没有需要处理的商品数据。', data: [] }
  }

  updateFn({ message: `总共需要为 ${skuLifecycles.length} 个商品启用库存分配，将分批处理...` })

  const batchFn = async (batchOfLifecycles) => {
    try {
      const skus = batchOfLifecycles.map((item) => item.sku)
      updateFn({ message: `正在处理批次, SKUs: ${skus.join(',')}` })

      // 1. 获取所需要的数据
      const { store, vendor, department } = context
      console.log("store", store)
      console.log("vendor", vendor)
      console.log("department", department)

      // {
      //   "sku": "10103311691843\n10103311691844\n10103311691845\n10103311691846",
      //   "skus": [
      //     {
      //       "sku": "10103311691843",
      //       "status": "pending",
      //       "data": {
      //         "sku": "10103311691843",
      //         "goodsNo": "CMG4421440007530",
      //         "eid": "4421857165221",
      //         "statusEnumCode": "1",
      //         "shopGoodsName": "依视路黑框眼镜男近视有度数gm复古大眼睛框架ins风素颜神器女显脸小 7022箭头黑 平光镜",
      //         "thirdCategoryId": "28640",
      //         "shopGoodsNo": "CSG4422715048753",
      //         "jdDeliverEnumCode": "1",
      //         "id": "4422715048753",
      //         "jdDeliver": "是",
      //         "enableFlag": "启用",
      //         "sellerGoodsSign": "10103311691843",
      //         "enableFlagEnumCode": "2",
      //         "status": "启用"
      //       },
      //       "completedTasks": {},
      //       "logs": []
      //     },
      //     {
      //       "sku": "10103311691844",
      //       "status": "pending",
      //       "data": {
      //         "sku": "10103311691844",
      //         "goodsNo": "CMG4421397915995",
      //         "eid": "4421857165197",
      //         "statusEnumCode": "1",
      //         "shopGoodsName": "依视路黑框眼镜男近视有度数gm复古大眼睛框架ins风素颜神器女显脸小 7022箭头黑 平光镜送镜盒镜布",
      //         "thirdCategoryId": "28640",
      //         "shopGoodsNo": "CSG4422715048737",
      //         "jdDeliverEnumCode": "1",
      //         "id": "4422715048737",
      //         "jdDeliver": "是",
      //         "enableFlag": "启用",
      //         "sellerGoodsSign": "10103311691844",
      //         "enableFlagEnumCode": "2",
      //         "status": "启用"
      //       },
      //       "completedTasks": {},
      //       "logs": []
      //     },
      //     {
      //       "sku": "10103311691845",
      //       "status": "pending",
      //       "data": {
      //         "sku": "10103311691845",
      //         "goodsNo": "CMG4421857199893",
      //         "eid": "4421857165193",
      //         "statusEnumCode": "1",
      //         "shopGoodsName": "依视路黑框眼镜男近视有度数gm复古大眼睛框架ins风素颜神器女显脸小 7022箭头黑 防蓝光平光镜",
      //         "thirdCategoryId": "28640",
      //         "shopGoodsNo": "CSG4422111164146",
      //         "jdDeliverEnumCode": "0",
      //         "id": "4422111164146",
      //         "jdDeliver": "否",
      //         "enableFlag": "启用",
      //         "sellerGoodsSign": "10103311691845",
      //         "enableFlagEnumCode": "2",
      //         "status": "启用"
      //       },
      //       "completedTasks": {},
      //       "logs": []
      //     },
      //     {
      //       "sku": "10103311691846",
      //       "status": "pending",
      //       "data": {
      //         "sku": "10103311691846",
      //         "goodsNo": "CMG4421857199909",
      //         "eid": "4421857165209",
      //         "statusEnumCode": "1",
      //         "shopGoodsName": "依视路黑框眼镜男近视有度数gm复古大眼睛框架ins风素颜神器女显脸小 7022箭头黑 防蓝光平光镜送镜盒镜布",
      //         "thirdCategoryId": "28640",
      //         "shopGoodsNo": "CSG4422715048745",
      //         "jdDeliverEnumCode": "0",
      //         "id": "4422715048745",
      //         "jdDeliver": "否",
      //         "enableFlag": "启用",
      //         "sellerGoodsSign": "10103311691846",
      //         "enableFlagEnumCode": "2",
      //         "status": "启用"
      //       },
      //       "completedTasks": {},
      //       "logs": []
      //     }
      //   ],
      //   "store": {
      //     "id": 20000352400,
      //     "shopNo": "CSP0020000352400",
      //     "shopName": "帕莎眼镜经营部",
      //     "spShopNo": "13321466",
      //     "status": "启用",
      //     "bizTypeName": "京仓",
      //     "typeName": "SOP店铺",
      //     "spSourceName": "京东商城",
      //     "deptId": 22010232593780,
      //     "deptName": "仙游县鲤城双旺木材",
      //     "jdDeliver": 1,
      //     "jdDeliverStatus": 4
      //   },
      //   "warehouse": {
      //     "id": 14897,
      //     "warehouseId": 14897,
      //     "warehouseNo": "800014897",
      //     "warehouseName": "莆田威铭云仓1号库",
      //     "warehouseType": 1,
      //     "warehouseTypeStr": "普通仓库",
      //     "deptName": "仙游县鲤城双旺木材",
      //     "effectTime": "2024-10-06 10:25:35",
      //     "updateTime": "2025-03-13 21:22:28"
      //   },
      //   "vendor": {
      //     "id": "CMS4418047117122",
      //     "name": "仙游县鲤城双旺木材",
      //     "supplierNo": "CMS4418047117122"
      //   },
      //   "department": {
      //     "name": "仙游县鲤城双旺木材",
      //     "deptNo": "CBU22010232593780",
      //     "sellerId": 20000021459,
      //     "sellerNo": "CCP0020000021459",
      //     "sellerName": "莆田威铭科技有限公司"
      //   },
      //   "mode": "sku"
      // }

      const CMGList = skuLifecycles.map((item) => item.goodsId)
      const shopGoodsMap_example = {
        "4421440007530_20000352400": {
          "id": 4422715048753,    // CSG 后面的 id
          "shopId": store.id,    // 店铺 id
          "shopNo": store.shopNo,    // 店铺编号
          "shopName": store.shopNo,    // 店铺名称
          "sellerId": department.sellerId,    // department.sellerId 
          "sellerNo": department.sellerNo,    // department.sellerNo
          "sellerName": department.sellerName,  // department.sellerName
          "deptId": department.deptNo.replace(/^CBU/, ''),    // department.deptNo 后面的 id
          "deptNo": department.deptNo,    // department.deptNo
          "deptName": department.name,    // department.name
          "goodsId": 4421440007530,    // CMG 后面的 id
          "goodsNo": "CMG4421440007530"    // CMG 
        }
      }

      const shopGoodsMap = skuLifecycles.reduce((acc, item) => {
        const key = `${item.goodsId}_${store.shopNo}`
        acc[key] = item
        return acc
      }, {})

      const goodsIdList = [4421440007530]

      const goodsStockConfigs = [{
        "shopId": "20000352400",
        "percent": "100",
        "vmiPercent": "100",
        "stockWay": "1"
      }]


      let data = qs.stringify({
        'csrfToken': '8b8859436cc94aa596ad32a246764c7e',
        'shopGoodsMapStr': JSON.stringify(shopGoodsMap),
        'goodsIdListStr': JSON.stringify(goodsIdList),
        'goodsStockConfigsStr': JSON.stringify(goodsStockConfigs)
      })

      // 2. 获取构建 shopGoodsMapStr 所需的更详细的商品信息
      // // const shopId = store.shopNo.replace(/^CSP00/, '')
      // const shopGoodsMap = stockConfigDetails.aaData.reduce((acc, item) => {
      //   const key = `${item.goodsId}_${shopId}`
      //   acc[key] = item
      //   return acc
      // }, {})
      // console.log(shopGoodsMap)

      // const key = `${shopId}_${goodsIdList.join(',')}`

      // const csgDetails = await jdApiService.getCsgBySkus(skus, sessionData)
      // if (!csgDetails.success || !csgDetails.products || csgDetails.products.length === 0) {
      //   updateFn({ message: '无法获取构建映射所需的商品详情。', type: 'warning' })
      //   return { success: false, message: '无法获取构建映射所需的商品详情。' }
      // }

      // // 3. 构建请求参数
      // const goodsIdList = stockConfigDetails.aaData.map((item) => item.goodsId)
      // const goodsIdListStr = JSON.stringify(goodsIdList)

      // const shopGoodsMap = csgDetails.products.reduce((acc, product) => {
      //   const key = `${product.goodsId}_${product.shopId}`
      //   acc[key] = product
      //   return acc
      // }, {})
      // const shopGoodsMapStr = JSON.stringify(shopGoodsMap)

      // const shopId = store.shopNo.replace(/^CSP00/, '')
      // const goodsStockConfigsStr = JSON.stringify([{
      //   shopId: shopId,
      //   percent: "100",
      //   vmiPercent: "100",
      //   stockWay: "1"
      // }])

      // // 4. 调用API
      // const response = await jdApiService.batchSaveSetting(shopGoodsMapStr, goodsIdListStr, goodsStockConfigsStr, sessionData)

      // if (response && response.success) {
      //   const msg = `批处理成功，影响 ${batchOfLifecycles.length} 个商品。`
      //   updateFn({ message: msg, type: 'success' })
      //   return {
      //     success: true,
      //     message: msg,
      //     data: batchOfLifecycles.map((item) => ({ sku: item.sku }))
      //   }
      // }

      // const errorMessage = response.message || JSON.stringify(response)
      // updateFn({ message: `批处理失败: ${errorMessage}`, type: 'error' })
      return { success: false, message: errorMessage }
    } catch (error) {
      const errorMessage = `批处理时发生严重错误: ${error.message}`
      updateFn({ message: errorMessage, type: 'error' })
      return { success: false, message: errorMessage }
    }
  }

  const batchResult = await executeInBatches({
    items: skuLifecycles,
    batchSize: API_BATCH_SIZE,
    delay: BATCH_DELAY,
    delayBetweenBatches: BATCH_DELAY,
    batchFn,
    log: (logData) => updateFn(typeof logData === 'string' ? { message: logData } : logData),
    isRunning: cancellationToken
  })

  if (!batchResult.success) {
    const errorMsg = `任务未完全成功: ${batchResult.message}`
    updateFn({ message: errorMsg, type: 'error' })
    throw new Error(errorMsg)
  }

  updateFn({ message: `任务完成: 成功 ${batchResult.successCount} 批, 失败 ${batchResult.failureCount} 批。` })
  return {
    success: true,
    message: batchResult.message || '任务执行完毕。',
    data: batchResult.data
  }
}

export default {
  name: 'enableInventoryAllocation',
  description: '启用库存商品分配（API）',
  execute
}

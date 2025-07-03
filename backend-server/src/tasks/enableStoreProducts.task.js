/**
 * 后端任务：启用店铺商品
 * 1. 查询停用的商品
 * 2. 提取CSG编号并创建Excel文件
 * 3. 上传文件以启用商品
 * 
 * 7.2 优化 查询csg使用 新方案查询  getProductData.task.js 查询
 */
import XLSX from 'xlsx'
import { getDisabledProducts, uploadStatusUpdateFile, enableStoreProducts } from '../services/jdApiService.js'

/**
 * 主执行函数 - 由任务调度器调用
 * @param {object} context 包含 skus, store, department, vendor
 * @param {function} updateFn 更新任务状态的函数
 * @param {object} sessionData 包含会话全部信息的对象
 * @returns {Promise<object>} 任务执行结果
 */
async function execute(context, updateFn, sessionData) {
  try {
    console.log('enableStoreProducts 任务开始执行');
    console.log('接收到的 context 参数:', JSON.stringify({
      skus: context.skus ? `${context.skus.length} 个SKU` : '无SKUs',
      store: context.store ? { name: context.store.name, shopNo: context.store.shopNo, spShopNo: context.store.spShopNo } : '无店铺信息',
      department: context.department ? { name: context.department.name, deptNo: context.department.deptNo } : '无事业部信息',
      vendor: context.vendor ? { name: context.vendor.name, id: context.vendor.id } : '无供应商信息'
    }, null, 2));
    console.log('sessionData 状态:', sessionData ? '存在' : '不存在');
    if (sessionData) {
      console.log('sessionData 内容检查:');
      console.log('- cookies 存在:', !!sessionData.cookies);
      console.log('- uniqueKey 存在:', !!sessionData.uniqueKey);
      console.log('- operationId 存在:', !!sessionData.operationId);
    }

    const { skus, store } = context

    // 1. 参数校验
    if (!skus || skus.length === 0) {
      return { success: true, message: 'SKU列表为空，无需操作。' }
    }
    if (!store) {
      console.error('缺少有效的店铺信息');
      throw new Error('缺少有效的店铺信息。')
    }
    if (!sessionData || !sessionData.cookies) {
      console.error('缺少会话信息:', sessionData);
      throw new Error('缺少会话信息')
    }

    console.log(`[Task: enableStoreProducts] "启用店铺商品" 开始，店铺 [${store.name}]...`)

    // 准备调用API所需的数据，合并上下文和会话信息
    const dataForApi = { ...sessionData, store }

    // 2. 查询停用的商品
    console.log(`[Task: enableStoreProducts] 正在查询 ${skus.length} 个SKU的状态...`)
    const disabledProducts = await getDisabledProducts(skus, dataForApi)

    if (!disabledProducts || disabledProducts.length === 0) {
      console.log('[Task: enableStoreProducts] 所有商品状态正常，无需启用。')
      return { success: true, message: '所有商品状态均正常，无需启用。' }
    }

    console.log('enableStoreProducts.task.js -- disabledProducts:', disabledProducts)


    // 3. 启用商品主数据 CMG 4422471628225  去掉 CMG 开头
    const cmgs_enableStoreProducts = disabledProducts.map((p) => p.goodsNo.replace('CMG', ''))
    const result_enableStoreProducts = await enableStoreProducts(cmgs_enableStoreProducts, dataForApi)
    console.log('enableStoreProducts.task.js -- result_enableStoreProducts:', result_enableStoreProducts)

    if (result_enableStoreProducts.resultCode !== 1) {
      console.error('启用商品主数据失败:', result_enableStoreProducts)
      throw new Error('启用商品主数据失败:' + result_enableStoreProducts.resultMessage)
    }
    console.log(`启用 ${cmgs_enableStoreProducts.length} 个商品, 启用商品主数据成功`)
    const message_enableStoreProducts = `启用 ${cmgs_enableStoreProducts.length} 个商品, 启用商品主数据成功`


    // 4. 提取CSG编号并创建Excel文件 shopGoodsNo
    const csgNumbers = disabledProducts.map((p) => p.shopGoodsNo)
    console.log(
      `[Task: enableStoreProducts]发现 ${csgNumbers.length} 个停用商品，准备通过上传文件启用...`
    )

    // 创建Excel数据
    const headers = ['店铺商品编号 (CSG编码)', '商品状态(1启用, 2停用)']
    const dataRows = csgNumbers.map((csg) => [csg, 1])
    const excelData = [headers, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const fileBuffer = XLSX.write(wb, { bookType: 'xls', type: 'buffer' })

    // 4. 上传文件以启用商品
    const result = await uploadStatusUpdateFile(fileBuffer, dataForApi)

    console.log('[Task: enableStoreProducts] "启用店铺商品" 任务成功完成。')
    // 从返回的HTML中提取有用的信息
    const match = result.message.match(/成功(?:导入|更新)\s*(\d+)\s*条/)
    const successCount = match ? match[1] : csgNumbers.length

    return { success: true, message: `成功启用 ${successCount} 个商品, ${message_enableStoreProducts}` }
  } catch (error) {
    console.error('enableStoreProducts 任务执行出错:', error);
    throw error;
  }
}

export default {
  name: 'enableStoreProducts',
  description: '启用店铺商品',
  execute: execute
}

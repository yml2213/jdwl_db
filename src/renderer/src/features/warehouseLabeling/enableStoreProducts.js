import { queryProductStatus, enableShopProducts } from '../../services/apiService'

/**
 * 检查批次中商品的状态并找出停用的商品
 * @param {object} params - 参数
 * @param {Array<string>} params.skus - SKU列表
 * @param {object} params.store - 店铺对象
 * @param {object} helpers - 辅助函数
 * @returns {Promise<Array<string>>} 停用的SKU列表
 */
async function findDisabledProducts({ skus, store }, helpers) {
  const allDisabledProducts = []
  try {
    const QUERY_BATCH_SIZE = 1000
    const skuGroups = []
    for (let i = 0; i < skus.length; i += QUERY_BATCH_SIZE) {
      skuGroups.push(skus.slice(i, i + QUERY_BATCH_SIZE))
    }
    helpers.log(`将 ${skus.length} 个SKU分成 ${skuGroups.length} 组进行状态查询`)

    for (let i = 0; i < skuGroups.length; i++) {
      const group = skuGroups[i]
      helpers.log(`查询第 ${i + 1}/${skuGroups.length} 组, ${group.length}个SKU...`)
      const statusResult = await queryProductStatus(group, store, store)

      if (statusResult.success && statusResult.disabledItems.length > 0) {
        helpers.log(`发现 ${statusResult.disabledItems.length} 个停用商品`)
        allDisabledProducts.push(...statusResult.disabledItems)
      } else if (!statusResult.success) {
        helpers.log(`查询商品状态出错: ${statusResult.message}`, 'warning')
      }
      if (i < skuGroups.length - 1) await new Promise((r) => setTimeout(r, 500))
    }
  } catch (error) {
    helpers.log(`检查商品状态失败: ${error.message}`, 'error')
    throw error
  }
  return allDisabledProducts
}

export default {
  name: 'enableStoreProducts',
  label: '启用店铺商品',

  /**
   * 执行启用店铺商品功能
   * @param {Array<string>|Object} skuListOrContext - SKU列表或上下文对象
   * @param {Object} taskOrHelpers - 任务对象或辅助函数对象
   * @returns {Promise<Object>} 执行结果
   */
  async execute(skuListOrContext, taskOrHelpers) {
    // 兼容两种调用方式：
    // 1. 新方式: execute({skus, store}, helpers)
    // 2. 旧方式: execute(skuList, task)

    let skus, store, helpers;

    if (Array.isArray(skuListOrContext)) {
      // 旧的调用方式
      console.log('使用旧的调用方式 execute(skuList, task)');
      console.log('传入的task对象:', JSON.stringify(taskOrHelpers, null, 2));

      skus = skuListOrContext;

      // 尝试从不同位置获取店铺信息
      store = taskOrHelpers.店铺信息 || taskOrHelpers.shopInfo || {};
      console.log('提取的store对象:', JSON.stringify(store, null, 2));

      // 如果store中没有必要的信息，尝试从其他地方获取
      if (!store.shopNo && taskOrHelpers.shopNo) {
        store.shopNo = taskOrHelpers.shopNo;
      }

      if (!store.deptNo && taskOrHelpers.deptNo) {
        store.deptNo = taskOrHelpers.deptNo;
      }

      // 从task对象中查找所有可能包含店铺信息的字段
      console.log('task对象的所有键:', Object.keys(taskOrHelpers));

      // 创建一个简单的helpers对象
      helpers = {
        log: (message, type = 'info') => {
          console.log(`[enableStoreProducts ${type}] ${message}`);
          if (taskOrHelpers.importLogs) {
            taskOrHelpers.importLogs.push({
              type,
              message,
              timestamp: new Date().toLocaleString()
            });
          }
        },
        updateProgress: (current, total) => {
          console.log(`[enableStoreProducts progress] ${current}/${total}`);
        }
      };
    } else {
      // 新的调用方式
      console.log('使用新的调用方式 execute({skus, store}, helpers)');
      ({ skus, store } = skuListOrContext);
      helpers = taskOrHelpers;
    }

    helpers.log(`开始执行 [${this.label}] 功能...`);

    // 打印store对象的内容，帮助调试
    console.log('最终使用的store对象:', JSON.stringify(store, null, 2));

    if (!store || !store.shopNo || !store.deptNo) {
      const errorMsg = '未提供有效的店铺或事业部信息 (shopNo, deptNo)';
      console.error(errorMsg, '可用的store:', store);
      helpers.log(errorMsg, 'error');
      throw new Error(errorMsg);
    }
    const { shopNo: _shopNo } = store;

    if (!skus || skus.length === 0) {
      helpers.log('SKU列表为空，无需执行。');
      return { success: true, message: 'SKU列表为空，跳过执行。' };
    }
    helpers.log(`店铺: ${store.shopName || _shopNo}, 事业部: ${store.deptName || store.deptNo}`);

    // 1. 查找所有停用的商品
    const disabledSkus = await findDisabledProducts({ skus, store }, helpers);
    helpers.log(`状态检查完成，共发现 ${disabledSkus.length} 个停用商品。`);

    // 2. 如果有停用的商品，则启用它们
    if (disabledSkus.length > 0) {
      helpers.log(`准备启用 ${disabledSkus.length} 个商品...`);
      const enableResult = await enableShopProducts(disabledSkus, store);

      if (enableResult.success) {
        let successMessage = `成功启用 ${disabledSkus.length} 个商品。`; // Default message
        if (enableResult.message) {
          try {
            const serverResponse = JSON.parse(enableResult.message);
            // Combine the message and data from server for a more informative response
            if (serverResponse.resultMessage && serverResponse.resultData) {
              successMessage = `${serverResponse.resultMessage} ${serverResponse.resultData}`;
            } else if (serverResponse.resultMessage) {
              successMessage = serverResponse.resultMessage;
            } else {
              // It's a JSON but with unknown format, just show the string.
              successMessage = enableResult.message;
            }
          } catch (e) {
            // Not a JSON string, use the raw message.
            successMessage = enableResult.message;
          }
        }
        helpers.log(successMessage, 'success');
        return { success: true, message: successMessage };
      } else {
        throw new Error(enableResult.message || '启用商品时发生未知 API 错误');
      }
    }

    helpers.log('所有商品状态正常，无需启用。', 'success');
    return { success: true, message: '所有商品状态均正常。' };
  },

  /**
   * 处理启用店铺商品结果
   * @returns {Promise<Object>} 处理结果
   */
  async handleResult() {
    // 启用店铺商品功能结果已经在execute方法中完成，不需要额外处理
    return null
  }
}

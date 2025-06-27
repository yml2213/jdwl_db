/**
 * 存储助手工具
 * 用于保存和获取用户选择的供应商和事业部信息
 */

// 存储键名
const STORAGE_KEYS = {
  VENDOR: 'selected_vendor',
  DEPARTMENT: 'selected_department',
  HAS_SELECTED: 'has_selected',
  SHOP: 'selected_shop',
  SHOPS_LIST: 'shops_list',
  WAREHOUSE: 'selected_warehouse',
  WAREHOUSES_LIST: 'warehouses_list',
  LAST_WORKFLOW: 'last_workflow',
  MANUAL_OPTIONS: 'manual_options',
  LAST_SKU_INPUT: 'last_sku_input'
}

/**
 * 保存选择的供应商
 * @param {Object} vendor 供应商对象
 */
export function saveSelectedVendor(vendor) {
  if (!vendor) return
  localStorage.setItem(STORAGE_KEYS.VENDOR, JSON.stringify(vendor))
}

/**
 * 保存选择的事业部
 * @param {Object} department 事业部对象
 */
export function saveSelectedDepartment(department) {
  if (!department) return
  localStorage.setItem(STORAGE_KEYS.DEPARTMENT, JSON.stringify(department))
}

/**
 * 保存选择的店铺
 * @param {Object} shop 店铺对象
 */
export function saveSelectedShop(shop) {
  if (!shop) return
  localStorage.setItem(STORAGE_KEYS.SHOP, JSON.stringify(shop))
}

/**
 * 保存选择的仓库
 * @param {Object} warehouse 仓库对象
 */
export function saveSelectedWarehouse(warehouse) {
  if (!warehouse) return
  localStorage.setItem(STORAGE_KEYS.WAREHOUSE, JSON.stringify(warehouse))
}

/**
 * 保存店铺列表到本地存储
 * @param {Array} shops 店铺列表
 */
export function saveShopsList(shops) {
  if (!shops || !Array.isArray(shops)) return
  localStorage.setItem(STORAGE_KEYS.SHOPS_LIST, JSON.stringify(shops))
}

/**
 * 保存仓库列表到本地存储
 * @param {Array} warehouses 仓库列表
 */
export function saveWarehousesList(warehouses) {
  if (!warehouses || !Array.isArray(warehouses)) return
  localStorage.setItem(STORAGE_KEYS.WAREHOUSES_LIST, JSON.stringify(warehouses))
}

/**
 * 保存上次选择的工作流
 * @param {string} workflowId 工作流ID
 */
export function saveLastWorkflow(workflowId) {
  if (!workflowId) return
  localStorage.setItem(STORAGE_KEYS.LAST_WORKFLOW, workflowId)
}

/**
 * 保存手动模式下的选项
 * @param {Object} options 选项对象
 */
export function saveManualOptions(options) {
  if (!options) return
  localStorage.setItem(STORAGE_KEYS.MANUAL_OPTIONS, JSON.stringify(options))
}

/**
 * 保存上次输入的SKU
 * @param {string} skuText
 */
export function saveLastSkuInput(skuText) {
  if (typeof skuText === 'string') {
    localStorage.setItem(STORAGE_KEYS.LAST_SKU_INPUT, skuText)
  }
}

/**
 * 获取店铺列表
 * @returns {Array} 店铺列表，如果不存在则返回空数组
 */
export function getShopsList() {
  const data = localStorage.getItem(STORAGE_KEYS.SHOPS_LIST)
  if (!data) return []
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的店铺列表数据失败', e)
    return []
  }
}

/**
 * 获取仓库列表
 * @returns {Array} 仓库列表，如果不存在则返回空数组
 */
export function getWarehousesList() {
  const data = localStorage.getItem(STORAGE_KEYS.WAREHOUSES_LIST)
  if (!data) return []
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的仓库列表数据失败', e)
    return []
  }
}

/**
 * 获取上次选择的工作流
 * @returns {string|null} 工作流ID
 */
export function getLastWorkflow() {
  return localStorage.getItem(STORAGE_KEYS.LAST_WORKFLOW)
}

/**
 * 获取手动模式下的选项
 * @returns {Object|null} 选项对象
 */
export function getManualOptions() {
  const data = localStorage.getItem(STORAGE_KEYS.MANUAL_OPTIONS)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的手动模式选项失败', e)
    return null
  }
}

/**
 * 获取上次输入的SKU
 * @returns {string}
 */
export function getLastSkuInput() {
  return localStorage.getItem(STORAGE_KEYS.LAST_SKU_INPUT) || ''
}

/**
 * 标记用户已经进行了选择
 */
export function markAsSelected() {
  localStorage.setItem(STORAGE_KEYS.HAS_SELECTED, 'true')
}

/**
 * 获取保存的供应商
 * @returns {Object|null} 供应商对象，如果不存在则返回null
 */
export function getSelectedVendor() {
  const data = localStorage.getItem(STORAGE_KEYS.VENDOR)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的供应商数据失败', e)
    return null
  }
}

/**
 * 获取保存的事业部
 * @returns {Object|null} 事业部对象，如果不存在则返回null
 */
export function getSelectedDepartment() {
  const data = localStorage.getItem(STORAGE_KEYS.DEPARTMENT)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的事业部数据失败', e)
    return null
  }
}

/**
 * 获取保存的店铺
 * @returns {Object|null} 店铺对象，如果不存在则返回null
 */
export function getSelectedShop() {
  const data = localStorage.getItem(STORAGE_KEYS.SHOP)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的店铺数据失败', e)
    return null
  }
}

/**
 * 获取保存的仓库
 * @returns {Object|null} 仓库对象，如果不存在则返回null
 */
export function getSelectedWarehouse() {
  const data = localStorage.getItem(STORAGE_KEYS.WAREHOUSE)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的仓库数据失败', e)
    return null
  }
}

/**
 * 检查用户是否已经选择过供应商和事业部
 * @returns {boolean} 是否已选择
 */
export function hasUserSelected() {
  return localStorage.getItem(STORAGE_KEYS.HAS_SELECTED) === 'true'
}

/**
 * 清除所有选择数据
 */
export function clearSelections() {
  localStorage.removeItem(STORAGE_KEYS.VENDOR)
  localStorage.removeItem(STORAGE_KEYS.DEPARTMENT)
  localStorage.removeItem(STORAGE_KEYS.HAS_SELECTED)
  localStorage.removeItem(STORAGE_KEYS.SHOP)
  localStorage.removeItem(STORAGE_KEYS.SHOPS_LIST)
  localStorage.removeItem(STORAGE_KEYS.WAREHOUSE)
  localStorage.removeItem(STORAGE_KEYS.WAREHOUSES_LIST)
  localStorage.removeItem(STORAGE_KEYS.LAST_WORKFLOW)
  localStorage.removeItem(STORAGE_KEYS.MANUAL_OPTIONS)
  localStorage.removeItem(STORAGE_KEYS.LAST_SKU_INPUT)
}

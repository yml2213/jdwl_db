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
  LAST_SKU_INPUT: 'last_sku_input',
  INVENTORY_CLEARANCE_FORM: 'inventory_clearance_form',
  WAREHOUSE_LABELING_FORM: 'warehouse_labeling_form'
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
 * 保存库存清零表单状态
 * @param {Object} form
 */
export function saveInventoryClearanceForm(form) {
  if (form) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM, JSON.stringify(form))
  }
}

/**
 * 保存入仓打标表单状态
 * @param {Object} form
 */
export function saveWarehouseLabelingForm(form) {
  if (form) {
    localStorage.setItem(STORAGE_KEYS.WAREHOUSE_LABELING_FORM, JSON.stringify(form))
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
 * 获取库存清零表单状态
 * @returns {Object | null}
 */
export function getInventoryClearanceForm() {
  const data = localStorage.getItem(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    console.error('解析存储的库存清零表单失败', e)
    return null
  }
}

/**
 * 获取入仓打标表单状态
 * @returns {Object | null}
 */
export function getWarehouseLabelingForm() {
  const saved = localStorage.getItem(STORAGE_KEYS.WAREHOUSE_LABELING_FORM)
  return saved ? JSON.parse(saved) : null
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
  // 首先尝试从新的存储位置获取
  const lastSelected = getLastSelectedStoreAndWarehouse();
  if (lastSelected && lastSelected.store) {
    // 如果在新存储位置找到了店铺ID，则从店铺列表中查找完整对象
    const shopsList = getShopsList();
    if (shopsList && shopsList.length > 0) {
      const shopFromList = shopsList.find(shop => shop.shopNo === lastSelected.store);
      if (shopFromList) {
        return shopFromList;
      }
    }
  }

  // 如果从新存储位置没有找到，则尝试从旧存储位置获取
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
  // 首先尝试从新的存储位置获取
  const lastSelected = getLastSelectedStoreAndWarehouse();
  if (lastSelected && lastSelected.warehouse) {
    // 如果在新存储位置找到了仓库ID，则从仓库列表中查找完整对象
    const warehousesList = getWarehousesList();
    if (warehousesList && warehousesList.length > 0) {
      const warehouseFromList = warehousesList.find(warehouse => warehouse.warehouseNo === lastSelected.warehouse);
      if (warehouseFromList) {
        return warehouseFromList;
      }
    }
  }

  // 如果从新存储位置没有找到，则尝试从旧存储位置获取
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
  localStorage.removeItem(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM)
  localStorage.removeItem(STORAGE_KEYS.WAREHOUSE_LABELING_FORM)
  console.log('用户选择数据已清除')
}

/**
 * @description 清除所有应用设置相关的缓存，但保留用户身份和选择
 */
export function clearAppSettings() {
  console.log('正在清除应用设置缓存...')
  localStorage.removeItem(STORAGE_KEYS.LAST_WORKFLOW)
  localStorage.removeItem(STORAGE_KEYS.MANUAL_OPTIONS)
  localStorage.removeItem(STORAGE_KEYS.LAST_SKU_INPUT)
  localStorage.removeItem(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM)
  localStorage.removeItem(STORAGE_KEYS.WAREHOUSE_LABELING_FORM)
  console.log('应用设置缓存已清除。')
}

// 通用函数
export const getLocalStorage = (key) => {
  const item = localStorage.getItem(key)
  return item ? JSON.parse(item) : null
}

export const setLocalStorage = (key, value) => {
  if (value === null || value === undefined) {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

const LAST_SELECTED_STORE_WAREHOUSE_KEY = 'lastSelectedStoreAndWarehouse'

/**
 * 保存用户最后选择的店铺和仓库
 * @param {{ store: object, warehouse: object }} selection
 */
export function saveSelectedStoreAndWarehouse(selection) {
  if (selection && selection.store && selection.warehouse) {
    localStorage.setItem(LAST_SELECTED_STORE_WAREHOUSE_KEY, JSON.stringify(selection))
  }
}

/**
 * 获取用户最后选择的店铺和仓库
 * @returns {{ store: object, warehouse: object } | null}
 */
export function getLastSelectedStoreAndWarehouse() {
  const saved = localStorage.getItem(LAST_SELECTED_STORE_WAREHOUSE_KEY)
  return saved ? JSON.parse(saved) : null
}

/**
 * 存储助手工具
 * 用于保存和获取用户选择的供应商和事业部信息
 */

// 统一管理所有 localStorage 的键名
const STORAGE_KEYS = {
  VENDOR: 'selected_vendor',
  DEPARTMENT: 'selected_department',
  HAS_SELECTED: 'has_selected',
  SHOP: 'selected_shop',
  WAREHOUSE: 'selected_warehouse',
  INVENTORY_CLEARANCE_FORM: 'inventory_clearance_form',
  RETURN_STORAGE_FORM: 'return_storage_form',
  SHOPS_LIST: 'shops_list',
  WAREHOUSES_LIST: 'warehouses_list',
  WAREHOUSE_LABELING_FORM: 'warehouse_labeling_form'
  // 废弃或由其他逻辑处理的键名可以移除，保持整洁
  // SHOPS_LIST: 'shops_list',
  // WAREHOUSES_LIST: 'warehouses_list',
}

// --- 通用 Get/Set ---
const get = (key) => {
  const item = localStorage.getItem(key)
  try {
    return item ? JSON.parse(item) : null
  } catch (error) {
    console.error(`解析localStorage中的'${key}'失败:`, error)
    return null
  }
}

const set = (key, value) => {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (error) {
    console.error(`设置localStorage中的'${key}'失败:`, error)
  }
}

// --- 用户身份与选择 ---
export const saveSelectedVendor = (vendor) => set(STORAGE_KEYS.VENDOR, vendor)
export const getSelectedVendor = () => get(STORAGE_KEYS.VENDOR)

export const saveSelectedDepartment = (department) => set(STORAGE_KEYS.DEPARTMENT, department)
export const getSelectedDepartment = () => get(STORAGE_KEYS.DEPARTMENT)

export const saveSelectedShop = (shop) => set(STORAGE_KEYS.SHOP, shop)
export const getSelectedShop = () => get(STORAGE_KEYS.SHOP)

export const saveSelectedWarehouse = (warehouse) => set(STORAGE_KEYS.WAREHOUSE, warehouse)
export const getSelectedWarehouse = () => get(STORAGE_KEYS.WAREHOUSE)

export const saveShopsList = (shops) => set(STORAGE_KEYS.SHOPS_LIST, shops)
export const getShopsList = () => get(STORAGE_KEYS.SHOPS_LIST)

export const saveWarehousesList = (warehouses) => set(STORAGE_KEYS.WAREHOUSES_LIST, warehouses)
export const getWarehousesList = () => get(STORAGE_KEYS.WAREHOUSES_LIST)

export const markAsSelected = () => localStorage.setItem(STORAGE_KEYS.HAS_SELECTED, 'true')
export const hasUserSelected = () => localStorage.getItem(STORAGE_KEYS.HAS_SELECTED) === 'true'

// --- 表单数据持久化 ---
export const saveInventoryClearanceForm = (data) => set(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM, data)
export const getInventoryClearanceForm = () => get(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM)

export const saveReturnStorageForm = (data) => set(STORAGE_KEYS.RETURN_STORAGE_FORM, data)
export const getReturnStorageForm = () => get(STORAGE_KEYS.RETURN_STORAGE_FORM)

export const saveWarehouseLabelingForm = (data) => set(STORAGE_KEYS.WAREHOUSE_LABELING_FORM, data)
export const getWarehouseLabelingForm = () => get(STORAGE_KEYS.WAREHOUSE_LABELING_FORM)

// --- 复合选择逻辑 ---

const LAST_SELECTED_STORE_WAREHOUSE_KEY = 'lastSelectedStoreAndWarehouse'

/**
 * @description 保存用户最后选择的店铺和仓库ID
 * @param {{ store: string, warehouse: string }} selection - 包含店铺和仓库ID的对象
 */
export function saveLastSelectedStoreAndWarehouse(selection) {
  if (selection && selection.store && selection.warehouse) {
    set(LAST_SELECTED_STORE_WAREHOUSE_KEY, selection)
  }
}

/**
 * @description 获取用户最后选择的店铺和仓库ID
 * @returns {{ store: string, warehouse: string } | null}
 */
export function getLastSelectedStoreAndWarehouse() {
  return get(LAST_SELECTED_STORE_WAREHOUSE_KEY)
}

// --- 清理函数 ---
export function clearSelections() {
  console.log('正在清除用户选择数据...')
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
  localStorage.removeItem(LAST_SELECTED_STORE_WAREHOUSE_KEY)
  // hasUserSelected 用的是 'true' 字符串，也需要清理
  localStorage.removeItem('has_selected')
  console.log('用户选择数据已清除。')
}

export function clearAppSettings() {
  console.log('正在清除应用设置缓存...')
  localStorage.removeItem(STORAGE_KEYS.INVENTORY_CLEARANCE_FORM)
  localStorage.removeItem(STORAGE_KEYS.RETURN_STORAGE_FORM)
  console.log('应用设置缓存已清除。')
}

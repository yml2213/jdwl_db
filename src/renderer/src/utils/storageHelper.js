/**
 * 存储助手工具
 * 用于保存和获取用户选择的供应商和事业部信息
 */

// 存储键名
const STORAGE_KEYS = {
  VENDOR: 'selected_vendor',
  DEPARTMENT: 'selected_department',
  HAS_SELECTED: 'has_selected'
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
}

import { ref } from 'vue'
import { getShopList, getWarehouseList } from '@/services/apiService'
import {
  saveSelectedShop,
  getSelectedShop,
  saveShopsList,
  getShopsList,
  saveSelectedWarehouse,
  getSelectedWarehouse,
  saveWarehousesList,
  getWarehousesList,
  getSelectedDepartment,
  getSelectedVendor
} from '@/utils/storageHelper'

/**
 * @description 这是一个Vue组合式函数，专门用于管理店铺和仓库相关的状态和逻辑。
 * 它封装了加载、缓存、选择店铺和仓库的所有功能，使UI组件更简洁。
 * @returns {object} 返回一个包含店铺/仓库数据、加载状态和操作方法的对象。
 */
export function useShopAndWarehouse() {
  // --- 响应式状态定义 ---
  const shopsList = ref([]) // 店铺列表
  const warehousesList = ref([]) // 仓库列表
  const isLoadingShops = ref(false) // 是否正在加载店铺
  const isLoadingWarehouses = ref(false) // 是否正在加载仓库
  const shopLoadError = ref('') // 店铺加载错误信息
  const warehouseLoadError = ref('') // 仓库加载错误信息

  const selectedStore = ref('') // 当前选中的店铺编号
  const selectedWarehouse = ref('') // 当前选中的仓库编号
  const selectedDepartment = ref(getSelectedDepartment()) // 当前选中的事业部
  const selectedVendor = ref(getSelectedVendor()) // 当前选中的供应商

  /**
   * @description 异步加载店铺列表。
   * 优先从本地缓存加载，如果缓存不存在，则通过API获取。
   */
  const loadShops = async () => {
    isLoadingShops.value = true
    shopLoadError.value = ''
    try {
      const cachedShops = getShopsList()
      if (cachedShops && cachedShops.length > 0) {
        shopsList.value = cachedShops
      } else {
        const department = getSelectedDepartment()
        if (!department || !department.deptNo) throw new Error('未选择事业部')
        const deptId = department.deptNo.replace('CBU', '')
        const shops = await getShopList(deptId)
        shopsList.value = shops
        saveShopsList(shops) // 缓存到本地
      }
      // 恢复上次选择的店铺，或默认选择第一个
      const lastSelected = getSelectedShop()
      selectedStore.value = lastSelected?.shopNo || shopsList.value[0]?.shopNo
    } catch (error) {
      shopLoadError.value = `加载店铺失败: ${error.message}`
    } finally {
      isLoadingShops.value = false
    }
  }

  /**
   * @description 异步加载仓库列表。
   * 逻辑与加载店铺类似，优先从缓存读取。
   */
  const loadWarehouses = async () => {
    isLoadingWarehouses.value = true
    warehouseLoadError.value = ''
    try {
      const cached = getWarehousesList()
      if (cached && cached.length > 0) {
        warehousesList.value = cached
      } else {
        const vendor = getSelectedVendor()
        const department = getSelectedDepartment()
        if (!vendor?.id || !department?.sellerId || !department?.deptNo)
          throw new Error('未选择供应商或事业部')
        const warehouses = await getWarehouseList(
          department.sellerId,
          department.deptNo.replace('CBU', '')
        )
        warehousesList.value = warehouses
        saveWarehousesList(warehouses) // 缓存到本地
      }
      // 恢复上次选择的仓库，或默认选择第一个
      const lastSelected = getSelectedWarehouse()
      selectedWarehouse.value = lastSelected?.warehouseNo || warehousesList.value[0]?.warehouseNo
    } catch (error) {
      warehouseLoadError.value = `加载仓库失败: ${error.message}`
    } finally {
      isLoadingWarehouses.value = false
    }
  }

  /**
   * @description 持久化当前选择的店铺信息到本地存储。
   * @param {string} shopNo - 用户选择的店铺编号。
   */
  const persistSelectedShop = (shopNo) => {
    const shop = shopsList.value.find((s) => s.shopNo === shopNo)
    if (shop) saveSelectedShop(shop)
  }

  /**
   * @description 持久化当前选择的仓库信息到本地存储。
   * @param {string} warehouseNo - 用户选择的仓库编号。
   */
  const persistSelectedWarehouse = (warehouseNo) => {
    const warehouse = warehousesList.value.find((w) => w.warehouseNo === warehouseNo)
    if (warehouse) saveSelectedWarehouse(warehouse)
  }

  // 组件初始化时自动加载数据
  loadShops()
  loadWarehouses()

  // 返回所有状态和方法，供组件使用
  return {
    // State
    shopsList,
    warehousesList,
    isLoadingShops,
    isLoadingWarehouses,
    shopLoadError,
    warehouseLoadError,
    selectedStore,
    selectedWarehouse,
    selectedDepartment,
    selectedVendor,

    // Actions
    loadShops,
    loadWarehouses,
    persistSelectedShop,
    persistSelectedWarehouse
  }
}

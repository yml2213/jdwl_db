import { ref, onMounted, watch } from 'vue'
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
  getSelectedVendor,
  getLastSelectedStoreAndWarehouse,
  saveSelectedStoreAndWarehouse
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

  // 在组件挂载时加载上次的选择，改成同步执行以确保设置值的顺序正确
  onMounted(() => {
    // 先加载数据
    loadShops()
    loadWarehouses()

    // 然后在setTimeout中恢复选择，确保在shopsList已经加载完成后
    setTimeout(() => {
      const lastSelected = getLastSelectedStoreAndWarehouse()
      console.log('Last selected store and warehouse:', lastSelected)
      if (lastSelected && lastSelected.store) {
        selectedStore.value = lastSelected.store
      }
      if (lastSelected && lastSelected.warehouse) {
        selectedWarehouse.value = lastSelected.warehouse
      }
    }, 500) // 给予500ms的时间来加载shopsList和warehousesList
  })

  // 监听选择变化并保存
  watch(
    [selectedStore, selectedWarehouse],
    ([newStore, newWarehouse]) => {
      console.log('Saving store and warehouse:', newStore, newWarehouse)
      saveSelectedStoreAndWarehouse({
        store: newStore,
        warehouse: newWarehouse
      })
    },
    { deep: true }
  )

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

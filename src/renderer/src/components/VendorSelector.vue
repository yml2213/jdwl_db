<template>
  <div class="vendor-selector">
    <h3 class="section-title">选择供应商</h3>

    <div v-if="loading" class="loading-state">
      <span class="loading-text">加载供应商数据中...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-text">{{ error }}</span>
      <button @click="fetchVendors" class="retry-btn">重试</button>
    </div>

    <div v-else class="selector-content">
      <div class="search-container">
        <input
          type="text"
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索供应商..."
          @input="filterVendors"
        />
      </div>

      <div class="select-wrapper">
        <select v-model="selectedVendor" class="vendor-select" :disabled="!vendors.length">
          <option value="" disabled>请选择供应商</option>
          <option
            v-for="vendor in filteredVendors"
            :key="vendor.supplierNo"
            :value="vendor.supplierNo"
          >
            {{ vendor.supplierName }}
          </option>
        </select>
      </div>

      <div v-if="selectedVendor" class="selected-info">
        <p>
          已选择供应商: <strong>{{ getVendorName(selectedVendor) }}</strong>
        </p>
        <p v-if="selectedVendorInfo" class="vendor-info">
          供应商编号: {{ selectedVendorInfo.supplierNo }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { getVendorList } from '../services/apiService'
import { isLoggedIn } from '../utils/cookieHelper'

// 状态
const loading = ref(false)
const error = ref('')
const vendors = ref([])
const filteredVendors = ref([])
const selectedVendor = ref('')
const searchQuery = ref('')

// 获取供应商名称
const getVendorName = (supplierNo) => {
  const vendor = vendors.value.find((v) => v.supplierNo === supplierNo)
  return vendor ? vendor.supplierName : ''
}

// 获取当前选中的供应商详细信息
const selectedVendorInfo = computed(() => {
  if (!selectedVendor.value) return null
  return vendors.value.find((v) => v.supplierNo === selectedVendor.value)
})

// 过滤供应商
const filterVendors = () => {
  if (!searchQuery.value) {
    filteredVendors.value = vendors.value
    return
  }

  const query = searchQuery.value.toLowerCase()
  filteredVendors.value = vendors.value.filter(
    (vendor) =>
      vendor.supplierName.toLowerCase().includes(query) ||
      vendor.supplierNo.toLowerCase().includes(query)
  )
}

// 加载供应商列表
const fetchVendors = async (retryCount = 0) => {
  loading.value = true
  error.value = ''

  try {
    // 检查是否已登录
    const loggedIn = await isLoggedIn()
    if (!loggedIn) {
      error.value = '请先登录京东账号'
      loading.value = false
      return
    }

    console.log('开始获取供应商列表')
    const response = await getVendorList()
    vendors.value = response || []
    console.log('获取到的供应商数据:', vendors.value)

    // 检查是否获取到数据
    if (vendors.value.length === 0) {
      if (retryCount < 3) {
        // 如果尝试次数小于3次，等待2秒后重试
        console.log(`未获取到供应商数据，${retryCount + 1}/3 次尝试，2秒后重试...`)
        error.value = `未找到供应商数据，正在重试 (${retryCount + 1}/3)...`
        setTimeout(() => {
          fetchVendors(retryCount + 1)
        }, 2000)
        return
      } else {
        // 如果已经尝试3次，显示错误信息
        console.error('多次尝试后仍未获取到供应商数据')
        error.value = '多次尝试后仍未获取到供应商数据，请检查网络连接或重新登录'
      }
    } else {
      // 成功获取数据
      filterVendors() // 初始化过滤后的供应商列表
      error.value = ''
    }
  } catch (err) {
    console.error('获取供应商失败:', err)

    if (retryCount < 3) {
      // 如果尝试次数小于3次，等待2秒后重试
      console.log(`获取供应商失败，${retryCount + 1}/3 次尝试，2秒后重试...`)
      error.value = `获取供应商失败，正在重试 (${retryCount + 1}/3)...`
      setTimeout(() => {
        fetchVendors(retryCount + 1)
      }, 2000)
    } else {
      // 如果已经尝试3次，显示详细错误信息
      error.value = `获取供应商失败: ${err.message || '未知错误'}。可能是登录状态失效，请尝试重新登录。`
    }
  } finally {
    if (retryCount >= 3 || vendors.value.length > 0) {
      loading.value = false
    }
  }
}

// 定义事件
const emit = defineEmits(['vendor-selected'])

// 监听选择的供应商变化
watch(selectedVendor, (newValue) => {
  if (newValue) {
    const vendor = vendors.value.find((v) => v.supplierNo === newValue)
    if (vendor) {
      emit('vendor-selected', {
        id: newValue,
        name: vendor.supplierName
      })
    }
  }
})

// 监听登录状态变化
const checkLoginAndFetch = async () => {
  const loggedIn = await isLoggedIn()
  if (loggedIn) {
    fetchVendors()
  } else {
    vendors.value = []
    selectedVendor.value = ''
    error.value = '请先登录京东账号'
  }
}

// 组件挂载时加载供应商
onMounted(() => {
  console.log('VendorSelector组件挂载')
  checkLoginAndFetch()
})

// 监听登录成功事件
window.electron.ipcRenderer.on('login-successful', () => {
  console.log('收到登录成功事件')
  checkLoginAndFetch()
})

// 监听登出事件
window.electron.ipcRenderer.on('cookies-cleared', () => {
  console.log('收到登出事件')
  vendors.value = []
  selectedVendor.value = ''
  error.value = '请先登录京东账号'
})
</script>

<style scoped>
.vendor-selector {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  margin-bottom: 15px;
  color: #333;
  font-weight: 500;
}

.loading-state,
.error-state {
  padding: 15px 0;
  text-align: center;
}

.loading-text {
  color: #666;
}

.error-state {
  padding: 15px 0;
  text-align: center;
  background-color: #ffebee;
  border: 1px solid #ffcdd2;
  border-radius: 4px;
  margin: 10px 0;
}

.error-text {
  color: #d32f2f;
  font-weight: bold;
  display: block;
  margin-bottom: 10px;
}

.retry-btn {
  background-color: #f0f0f0;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  color: #333;
}

.retry-btn:hover {
  background-color: #e0e0e0;
}

.search-container {
  margin-bottom: 15px;
}

.search-input,
.vendor-select {
  width: 100%;
  padding: 12px 15px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

.search-input:focus,
.vendor-select:focus {
  border-color: #2196f3;
}

.select-wrapper {
  position: relative;
  margin-bottom: 15px;
}

.vendor-select {
  width: 100%;
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: #fff;
  font-size: 14px;
  color: #333;
  appearance: none;
  cursor: pointer;
}

.select-wrapper::after {
  content: '▼';
  position: absolute;
  right: 10px;
  top: 10px;
  color: #999;
  pointer-events: none;
  font-size: 12px;
}

.vendor-select:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.vendor-select option {
  background-color: #fff;
  color: #333;
  padding: 8px;
}

.selected-info {
  padding-top: 5px;
  color: #2196f3;
  font-size: 14px;
}

.vendor-info {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}
</style>

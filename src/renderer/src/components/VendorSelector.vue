<template>
  <div class="vendor-selector">
    <h4>选择供应商</h4>
    <div v-if="isLoading" class="loading">正在加载供应商...</div>
    <div v-if="error" class="error-message">
      {{ error }} <button @click="fetchVendors" class="retry-btn">重试</button>
    </div>
    <select v-model="selectedVendorId" @change="onVendorSelect" :disabled="isLoading || error">
      <option disabled value="">请选择一个供应商</option>
      <option v-for="vendor in vendors" :key="vendor.id" :value="vendor.id">
        {{ vendor.name }} ({{ vendor.supplierNo }})
      </option>
    </select>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getVendorList } from '../services/apiService'

const emit = defineEmits(['vendor-selected'])

const vendors = ref([])
const selectedVendorId = ref('')
const isLoading = ref(false)
const error = ref(null)

const fetchVendors = async () => {
  isLoading.value = true
  error.value = null
  try {
    const data = await getVendorList()
    if (data && data.length > 0) {
      vendors.value = data
    } else {
      vendors.value = []
      error.value = '未能获取到供应商列表，请检查网络或重新登录后重试。'
    }
  } catch (err) {
    console.error('获取供应商列表失败:', err)
    error.value = `获取供应商失败: ${err.message}`
  } finally {
    isLoading.value = false
  }
}

const onVendorSelect = () => {
  const selectedVendor = vendors.value.find((v) => v.id === selectedVendorId.value)
  if (selectedVendor) {
    emit('vendor-selected', selectedVendor)
  }
}

onMounted(() => {
  fetchVendors()
})
</script>

<style scoped>
.vendor-selector {
  margin-bottom: 20px;
}
.vendor-selector h4 {
  margin-bottom: 10px;
  color: #333;
}
select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.loading,
.error-message {
  margin: 10px 0;
  padding: 10px;
  border-radius: 4px;
}
.loading {
  color: #333;
  background-color: #f0f0f0;
}
.error-message {
  color: #d9534f;
  background-color: #f2dede;
  border: 1px solid #ebccd1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.retry-btn {
  padding: 4px 8px;
  border: 1px solid #d9534f;
  background-color: transparent;
  color: #d9534f;
  border-radius: 3px;
  cursor: pointer;
}
.retry-btn:hover {
  background-color: #d9534f;
  color: white;
}
</style>

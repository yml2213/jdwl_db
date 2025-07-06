<template>
  <div class="department-selector">
    <h4>选择事业部</h4>
    <div v-if="!vendorName" class="info-message">请先选择一个供应商</div>
    <div v-else>
      <div v-if="isLoading" class="loading">正在加载事业部...</div>
      <div v-else-if="error" class="error-message">
        {{ error }} <button @click="fetchDepartments" class="retry-btn">重试</button>
      </div>
      <select v-model="selectedDepartmentId" @change="onDepartmentSelect" :disabled="isLoading || error || !departments.length">
        <option disabled value="">请选择一个事业部</option>
        <option v-for="dept in departments" :key="dept.deptNo" :value="dept.deptNo">
          {{ dept.name }} ({{ dept.deptNo }})
        </option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { getDepartmentsByVendor } from '../services/apiService'

const props = defineProps({
  vendorName: {
    type: String,
    required: true
  }
})
const emit = defineEmits(['department-selected'])

const departments = ref([])
const selectedDepartmentId = ref('')
const isLoading = ref(false)
const error = ref(null)

const fetchDepartments = async () => {
  if (!props.vendorName) {
    departments.value = []
    return
  }
  isLoading.value = true
  error.value = null
  try {
    const data = await getDepartmentsByVendor(props.vendorName)
    if (data && data.length > 0) {
      departments.value = data
    } else {
      departments.value = []
      error.value = '未能获取到该供应商的事业部列表。'
    }
  } catch (err) {
    console.error('获取事业部列表失败:', err)
    error.value = `获取事业部失败: ${err.message}`
  } finally {
    isLoading.value = false
  }
}

const onDepartmentSelect = () => {
  const selectedDept = departments.value.find(d => d.deptNo === selectedDepartmentId.value)
  if (selectedDept) {
    emit('department-selected', selectedDept)
  }
}

watch(() => props.vendorName, (newName) => {
  selectedDepartmentId.value = ''
  departments.value = []
  error.value = null
  if (newName) {
    fetchDepartments()
  }
})
</script>

<style scoped>
.department-selector {
  margin-bottom: 20px;
}
.department-selector h4 {
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
.error-message,
.info-message {
  margin: 10px 0;
  padding: 10px;
  border-radius: 4px;
}
.loading {
  color: #333;
  background-color: #f0f0f0;
}
.info-message {
  color: #888;
  background-color: #f9f9f9;
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

<template>
  <div class="department-selector" :class="{ disabled: !vendorName }">
    <h3 class="section-title">选择事业部</h3>

    <div v-if="!vendorName" class="no-vendor-state">
      <span class="tip-text">请先选择供应商</span>
    </div>

    <div v-else-if="loading" class="loading-state">
      <span class="loading-text">加载事业部数据中...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-text">{{ error }}</span>
      <button @click="fetchDepartments" class="retry-btn">重试</button>
    </div>

    <div v-else class="selector-content">
      <div class="select-wrapper">
        <select
          v-model="selectedDepartment"
          class="department-select"
          :disabled="!departments.length"
        >
          <option value="" disabled>请选择事业部</option>
          <option v-for="dept in departments" :key="dept.id" :value="dept.id">
            {{ dept.name }}
          </option>
        </select>
      </div>

      <div v-if="selectedDepartment" class="selected-info">
        <p>
          已选择事业部: <strong>{{ getDepartmentName(selectedDepartment) }}</strong>
        </p>
        <p v-if="selectedDepartmentInfo" class="dept-info">
          编号: {{ selectedDepartmentInfo.deptNo }} | 创建时间:
          {{ selectedDepartmentInfo.createTime }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { getDepartmentsByVendor } from '../services/apiService'

// 定义属性
const props = defineProps({
  vendorName: {
    type: String,
    default: ''
  }
})

// 状态
const loading = ref(false)
const error = ref('')
const departments = ref([])
const selectedDepartment = ref('')

// 获取事业部名称
const getDepartmentName = (deptId) => {
  const dept = departments.value.find((d) => d.id === deptId)
  return dept ? dept.name : ''
}

// 获取当前选中的事业部详细信息
const selectedDepartmentInfo = computed(() => {
  if (!selectedDepartment.value) return null
  return departments.value.find((d) => d.id === selectedDepartment.value)
})

// 加载事业部列表
const fetchDepartments = async () => {
  if (!props.vendorName) return

  // 重置状态
  loading.value = true
  error.value = ''
  selectedDepartment.value = ''

  try {
    // 获取事业部列表
    const response = await getDepartmentsByVendor(props.vendorName)
    departments.value = response || []

    if (departments.value.length === 0) {
      error.value = '该供应商下未找到事业部数据'
    }
  } catch (err) {
    console.error('获取事业部失败:', err)
    error.value = `获取事业部失败: ${err.message || '未知错误'}`
  } finally {
    loading.value = false
  }
}

// 定义事件
const emit = defineEmits(['department-selected'])

// 监听选择的事业部变化
watch(selectedDepartment, (newValue) => {
  if (newValue) {
    const dept = departments.value.find((d) => d.id === newValue)
    if (dept) {
      emit('department-selected', {
        id: newValue,
        name: dept.name,
        deptNo: dept.deptNo,
        sellerName: dept.sellerName,
        sellerNo: dept.sellerNo
      })
    }
  }
})

// 监听供应商变化
watch(
  () => props.vendorName,
  (newValue) => {
    if (newValue) {
      fetchDepartments()
    } else {
      departments.value = []
      selectedDepartment.value = ''
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.department-selector {
  background-color: white;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.department-selector.disabled {
  opacity: 0.7;
}

.section-title {
  font-size: 16px;
  margin-bottom: 15px;
  color: #333;
  font-weight: 500;
}

.no-vendor-state,
.loading-state,
.error-state {
  padding: 15px 0;
  text-align: center;
}

.tip-text,
.loading-text {
  color: #666;
}

.error-text {
  color: #e53935;
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

.select-wrapper {
  position: relative;
  margin-bottom: 15px;
}

.department-select {
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

.department-select:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.selected-info {
  padding-top: 5px;
  color: #2196f3;
  font-size: 14px;
}

.dept-info {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}
</style>

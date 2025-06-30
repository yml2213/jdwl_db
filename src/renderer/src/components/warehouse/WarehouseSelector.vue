<template>
  <div class="form-group">
    <label class="form-label">选择仓库</label>
    <slot name="info" :warehouse="currentWarehouseInfo"></slot>
    <div class="select-wrapper">
      <select
        :value="modelValue"
        @change="onWarehouseChange"
        class="form-select"
        :disabled="loading"
      >
        <option value="" disabled>请选择仓库</option>
        <option
          v-for="warehouse in warehouses"
          :key="warehouse.warehouseNo"
          :value="warehouse.warehouseNo"
        >
          {{ warehouse.warehouseName }}
        </option>
      </select>
      <div v-if="loading" class="loading-indicator">加载中...</div>
      <div v-if="error" class="error-message">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  warehouses: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const currentWarehouseInfo = computed(() => {
  if (!props.modelValue || !props.warehouses || props.warehouses.length === 0) return null
  return props.warehouses.find((warehouse) => warehouse.warehouseNo === props.modelValue)
})

const onWarehouseChange = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)

  const selectedWarehouse = props.warehouses.find((warehouse) => warehouse.warehouseNo === value)
  emit('change', selectedWarehouse)
}
</script>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  height: 36px;
  cursor: pointer;
}

.form-select:focus {
  border-color: #2196f3;
}

.loading-indicator {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.error-message {
  font-size: 12px;
  color: #f56c6c;
  margin-top: 5px;
}
</style>

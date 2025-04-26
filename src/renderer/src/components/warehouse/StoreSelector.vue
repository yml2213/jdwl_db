<template>
  <div class="form-group">
    <label class="form-label">选择店铺</label>
    <div class="select-wrapper">
      <select :value="modelValue" @change="onStoreChange" class="form-select" :disabled="loading">
        <option value="" disabled>请选择店铺</option>
        <option v-for="shop in shops" :key="shop.shopNo" :value="shop.shopNo">
          {{ shop.shopName }}
        </option>
      </select>
      <div v-if="loading" class="loading-indicator">加载中...</div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="currentShopInfo" class="shop-info">
        <small>店铺编号: {{ currentShopInfo.shopNo }}</small>
        <small>类型: {{ currentShopInfo.typeName }} - {{ currentShopInfo.bizTypeName }}</small>
      </div>
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
  shops: {
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

const currentShopInfo = computed(() => {
  if (!props.modelValue || !props.shops || props.shops.length === 0) return null
  return props.shops.find((shop) => shop.shopNo === props.modelValue)
})

const onStoreChange = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)

  const selectedShop = props.shops.find((shop) => shop.shopNo === value)
  emit('change', selectedShop)
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

.shop-info {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  display: flex;
  flex-direction: column;
}
</style>

<template>
  <div class="form-group">
    <label class="form-label">选择店铺</label>
    <div class="search-wrapper">
      <input
        type="text"
        v-model="searchText"
        placeholder="搜索店铺..."
        class="search-input"
        @input="onSearch"
      />
      <button v-if="searchText" class="clear-search-btn" @click="clearSearch">×</button>
    </div>
    <div class="select-wrapper">
      <select :value="modelValue" @change="onStoreChange" class="form-select" :disabled="loading">
        <option value="" disabled>请选择店铺</option>
        <option v-for="shop in filteredShops" :key="shop.shopNo" :value="shop.shopNo">
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
import { computed, ref, watch } from 'vue'

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

// 搜索相关
const searchText = ref('')

// 过滤后的店铺列表
const filteredShops = computed(() => {
  if (!searchText.value) return props.shops

  const search = searchText.value.toLowerCase()
  return props.shops.filter(
    (shop) =>
      shop.shopName.toLowerCase().includes(search) || shop.shopNo.toLowerCase().includes(search)
  )
})

// 清除搜索
const clearSearch = () => {
  searchText.value = ''
}

// 搜索处理
const onSearch = () => {
  // 如果只有一个结果，自动选中
  if (filteredShops.value.length === 1) {
    const shopNo = filteredShops.value[0].shopNo
    emit('update:modelValue', shopNo)
    emit('change', filteredShops.value[0])
  }
}

// 检查当前选中的店铺是否在过滤结果中
watch(filteredShops, (newShops) => {
  if (props.modelValue && newShops.length > 0) {
    // 检查当前选中的值是否在过滤结果中
    const isCurrentInFiltered = newShops.some((shop) => shop.shopNo === props.modelValue)

    // 如果不在过滤结果中且有过滤结果，自动选择第一个
    if (!isCurrentInFiltered && searchText.value) {
      emit('update:modelValue', newShops[0].shopNo)
      emit('change', newShops[0])
    }
  }
})

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

.search-wrapper {
  position: relative;
  margin-bottom: 8px;
}

.search-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  height: 36px;
  font-size: 14px;
}

.search-input:focus {
  border-color: #2196f3;
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #909399;
  padding: 0;
  line-height: 1;
}

.clear-search-btn:hover {
  color: #f56c6c;
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

<template>
  <div class="form-group">
    <label class="form-label">功能选项</label>
    <div class="checkbox-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importStore" :disabled="!isManualMode" />
        <span>导入店铺商品</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useStore" :disabled="!isManualMode" />
        <span>启用店铺商品</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importProps" :disabled="!isManualMode" />
        <span>导入物流属性(参数)</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useWarehouse" :disabled="!isManualMode" />
        <span>启用库存商品分配</span>
      </label>

      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useJdEffect" :disabled="!isManualMode" />
        <span>启用京配打标生效</span>
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          v-model="options.useAddInventory"
          @change="handleAddInventoryChange"
          :disabled="!isManualMode"
        />
        <span>添加库存</span>
      </label>
      <!-- <label class="checkbox-label">
        <input type="checkbox" v-model="options.importTitle" />
        <span>导入商品标题</span>
      </label> -->
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importProductNames" :disabled="!isManualMode" />
        <span>导入商品简称</span>
      </label>
    </div>

    <div class="inventory-container" v-if="options.useAddInventory">
      <div class="logistics-header">库存信息</div>
      <div class="logistics-options">
        <div class="logistics-input-group">
          <label>数量：</label>
          <input
            type="number"
            v-model="options.inventoryAmount"
            min="1"
            max="10000"
            placeholder="默认: 1000"
            class="logistics-input"
            :disabled="!isManualMode"
          />
        </div>
      </div>
      <div class="logistics-hint">
        <span>提示：添加库存会对所选SKU创建指定数量的库存</span>
      </div>
    </div>

    <!-- 动态显示导入商品简称组件 -->
    <ProductNameImporter v-if="options.importProductNames" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ProductNameImporter from './ProductNameImporter.vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      importStore: true,
      useStore: true,
      importProps: false,
      useWarehouse: false,
      useJdEffect: false,
      useAddInventory: false,
      inventoryAmount: 1000,
      importTitle: false,
      importProductNames: false
    })
  },
  isManualMode: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue'])

const options = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 处理添加库存选项变更
const handleAddInventoryChange = (event) => {
  if (event.target.checked) {
    // 勾选"添加库存"时，设置默认库存数量为1000
    options.value.inventoryAmount = 1000
  }
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

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}

.checkbox-label span {
  color: #333;
  font-size: 14px;
}

.small-margin-left {
  margin-left: 15px;
  font-size: 0.9em;
}

.inventory-container {
  margin-top: 12px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #eaeaea;
}

.logistics-header {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid #f0f0f0;
}

.logistics-options {
  padding: 10px;
  background-color: #fafafa;
  border-radius: 4px;
}

.logistics-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.logistics-input-group label {
  flex-shrink: 0;
  width: 45px;
  text-align: right;
  font-size: 13px;
  color: #606266;
}

.logistics-input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.logistics-input:focus {
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.logistics-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>

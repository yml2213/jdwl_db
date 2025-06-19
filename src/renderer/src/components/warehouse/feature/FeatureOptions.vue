<template>
  <div class="form-group">
    <label class="form-label">功能选项</label>
    <div class="checkbox-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importStore" />
        <span>导入店铺商品</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useStore" />
        <span>启用店铺商品</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importProps" @change="handleImportPropsChange" />
        <span>导入物流属性(参数)</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useWarehouse" />
        <span>启用库存商品分配</span>
      </label>
      <label class="checkbox-label small-margin-left" v-if="options.useWarehouse">
        <input type="checkbox" v-model="options.skipConfigErrors" />
        <span>出错时跳过</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useJdEffect" />
        <span>启用京配打标生效</span>
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          v-model="options.useAddInventory"
          @change="handleAddInventoryChange"
        />
        <span>添加库存</span>
      </label>
      <!-- <label class="checkbox-label">
        <input type="checkbox" v-model="options.importTitle" />
        <span>导入商品标题</span>
      </label> -->
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importProductNames" />
        <span>导入商品简称</span>
      </label>
    </div>

    <div class="inventory-container" v-if="options.useAddInventory">
      <label class="inventory-label">库存数量：</label>
      <input
        type="number"
        v-model="options.inventoryAmount"
        min="1"
        max="10000"
        class="inventory-input"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'

const openLogisticsImporter = inject('openLogisticsImporter')

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
      importProductNames: false,
      skipConfigErrors: true // 默认启用跳过选项
    })
  }
})

const emit = defineEmits(['update:modelValue'])

const options = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 处理导入物流属性选项变更
const handleImportPropsChange = (event) => {
  if (event.target.checked) {
    // 勾选"导入物流属性"时，弹出导入对话框
    openLogisticsImporter()
  }
}

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
  display: flex;
  align-items: center;
  max-width: 250px;
}

.inventory-label {
  font-weight: 500;
  margin-right: 8px;
}

.inventory-input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

.inventory-input:focus {
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}
</style>

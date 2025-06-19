<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" name="inputType" value="single" v-model="form.inputType" />
          <span>输入SKU</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="inputType" value="store" v-model="form.inputType" />
          <span>整店SKU</span>
        </label>
      </div>
    </div>

    <!-- 只在"输入SKU"模式下显示SKU输入框 -->
    <sku-input
      v-if="form.inputType === 'single'"
      v-model="form.sku"
      @file-change="handleFileChange"
      @clear-file="handleClearFile"
    />

    <feature-options v-model="form.options" />

    <store-selector
      :shops="shopsList"
      :loading="isLoadingShops"
      :error="shopLoadError"
      v-model="form.selectedStore"
      @change="handleStoreChange"
    />

    <div class="form-actions">
      <button class="btn btn-default">保存快捷</button>
      <button class="btn btn-success" @click="handleAddTask">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import { inject, watch } from 'vue'
import SkuInput from './SkuInput.vue'
import FeatureOptions from './ClearStorageFeatureOptions.vue'
import StoreSelector from './StoreSelector.vue'

const form = inject('form')
const shopsList = inject('shopsList')
const isLoadingShops = inject('isLoadingShops')
const shopLoadError = inject('shopLoadError')

// 获取从父组件注入的方法
const handleAddTask = inject('handleAddTask')
const handleStoreChange = inject('handleStoreChange')
const handleFileChange = inject('handleFileChange')
const handleClearFile = inject('handleClearFile')

// 监听输入类型变化，当切换到整店SKU模式时清空SKU输入框
watch(
  () => form.inputType,
  (newType) => {
    if (newType === 'store') {
      form.sku = ''
    }
  }
)
</script>

<style scoped>
.operation-area {
  flex: 0 0 380px;
  background: #fff;
  padding: 20px;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.radio-group {
  display: flex;
  gap: 20px;
}

.radio-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 8px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  transition: all 0.3s;
}

.radio-label:hover {
  border-color: #2196f3;
}

.radio-label input[type='radio'] {
  margin-right: 6px;
}

.radio-label input[type='radio']:checked + span {
  color: #2196f3;
  font-weight: 500;
}

.radio-label:has(input[type='radio']:checked) {
  border-color: #2196f3;
  background-color: rgba(33, 150, 243, 0.05);
}

.form-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-default {
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  color: #606266;
}

.btn-success {
  background-color: #52c41a;
  border-color: #52c41a;
  color: white;
}

.btn:hover {
  opacity: 0.9;
}
</style>

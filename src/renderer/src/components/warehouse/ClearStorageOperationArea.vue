<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="select-wrapper">
        <select v-model="form.inputType" class="form-select">
          <option value="single">输入SKU</option>
          <option value="store">整店SKU</option>
        </select>
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

.select-wrapper {
  position: relative;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: none;
  outline: none;
  height: 36px;
  cursor: pointer;
  background-color: white;
}

.form-select:focus {
  border-color: #2196f3;
}
</style>

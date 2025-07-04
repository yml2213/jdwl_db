<template>
  <div class="importer-container">
    <div class="importer-header">
      <h4>导入商品简称</h4>
      <p class="subtitle">通过Excel文件批量导入商品简称信息。</p>
    </div>
    <FileUploader
      :is-loading="isLoading"
      upload-text="上传包含商品简称的Excel文件"
      @file-uploaded="handleFileImport"
    />
    <button @click="$emit('cancel')" class="cancel-button">取消</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import FileUploader from '../FileUploader.vue'
import productNameImporter from '@/features/warehouseLabeling/importProductNames'
import { useTaskList } from '@/composables/useTaskList'

defineEmits(['cancel'])

const { addTask } = useTaskList()
const isLoading = ref(false)

const handleFileImport = async (file) => {
  if (!file) {
    console.warn('没有选择文件')
    return
  }
  isLoading.value = true
  try {
    const task = productNameImporter.prepareTask(file)
    addTask(task.name, task.executionType, task.executionFeature, task.executionData, task.sku)
  } catch (error) {
    console.error('导入商品简称失败:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<style>
/* 定义一个全局样式来隐藏特定MessageBox的关闭按钮 */
.no-close-message-box .el-message-box__headerbtn {
  display: none !important;
}
</style>

<style scoped>
.importer-container {
  padding: 20px;
}
.importer-header h4 {
  margin: 0 0 5px 0;
  font-size: 16px;
}
.subtitle {
  font-size: 13px;
  color: #909399;
  margin-top: 0;
  margin-bottom: 15px;
}
.cancel-button {
  margin-top: 15px;
  width: 100%;
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #f0f0f0;
  cursor: pointer;
}
.cancel-button:hover {
  background-color: #e0e0e0;
}
</style>

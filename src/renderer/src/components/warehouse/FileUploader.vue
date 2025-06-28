<template>
  <div class="file-upload-container">
    <input
      type="file"
      ref="fileInputRef"
      @change="handleFileChange"
      accept=".txt"
      style="display: none"
    />
    <el-button @click="triggerFileInput">选择文件</el-button>
    <div v-if="selectedFile" class="selected-file-info">
      <span class="file-name">{{ selectedFile.name }}</span>
      <el-button type="danger" link @click="clearFile">清除</el-button>
    </div>
    <span v-else class="no-file-selected">未选择文件</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElButton } from 'element-plus'

const emit = defineEmits(['file-change'])

const fileInputRef = ref(null)
const selectedFile = ref(null)

const triggerFileInput = () => {
  fileInputRef.value.click()
}

const handleFileChange = (event) => {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    emit('file-change', file)
  }
}

const clearFile = () => {
  selectedFile.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  emit('file-change', null)
}
</script>

<style scoped>
.file-upload-container {
  display: flex;
  align-items: center;
  gap: 10px;
}
.selected-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}
.no-file-selected {
  font-size: 14px;
  color: #909399;
}
</style>

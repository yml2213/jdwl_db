<template>
  <div class="product-name-importer">
    <h4>导入商品简称</h4>
    <div class="importer-content">
      <div class="description">
        <p>通过Excel文件导入商品简称，Excel文件需包含两列：商家商品标识(SKU)和商品名称</p>
      </div>
      
      <div class="file-upload-area">
        <input
          type="file"
          ref="fileInputRef"
          @change="handleFileChange"
          accept=".xls,.xlsx"
          style="display: none"
        />
        <div class="upload-actions">
          <button class="btn btn-primary" @click="triggerFileInput" :disabled="isUploading">
            选择Excel文件
          </button>
          <span v-if="selectedFile" class="selected-file-name">
            已选：{{ selectedFile.name }}
            <button class="btn-link" @click="handleClearFile" :disabled="isUploading">清除</button>
          </span>
          <span v-else class="selected-file-name">未选择文件</span>
        </div>
        
                 <button 
          class="btn btn-success" 
          @click="handleImport" 
          :disabled="!selectedFile || isUploading"
        >
          {{ isUploading ? '导入中...' : '开始导入' }}
        </button>
      </div>
      
      <div v-if="importResult" class="import-result" :class="{ 'success': importResult.success, 'error': !importResult.success }">
        <h5>导入结果</h5>
        <p>{{ importResult.message }}</p>
        <div v-if="importResult.data" class="result-details">
          <p>总数: {{ importResult.data.totalNum }}</p>
          <p>成功: {{ importResult.data.successNum }}</p>
          <p>失败: {{ importResult.data.failNum }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import importProductNamesModule from '../../../features/warehouseLabeling/importProductNames.js'

const fileInputRef = ref(null)
const selectedFile = ref(null)
const isUploading = ref(false)
const importResult = ref(null)

// 触发文件选择框
const triggerFileInput = () => {
  fileInputRef.value.click()
}

// 处理文件选择
const handleFileChange = (event) => {
  const files = event.target.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
    importResult.value = null // 清除之前的导入结果
  }
}

// 清除已选择的文件
const handleClearFile = () => {
  selectedFile.value = null
  importResult.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// 导入商品简称
const handleImport = async () => {
  if (!selectedFile.value) {
    return
  }
  
  isUploading.value = true
  importResult.value = null
  
  try {
    const result = await importProductNamesModule.execute(selectedFile.value)
    importResult.value = result
    
    // 如果导入成功，清除文件选择
    if (result.success) {
      setTimeout(() => {
        handleClearFile()
      }, 3000)
    }
  } catch (error) {
    console.error('导入商品简称失败:', error)
    importResult.value = {
      success: false,
      message: `导入失败: ${error.message || '未知错误'}`
    }
  } finally {
    isUploading.value = false
  }
}
</script>

<style scoped>
.product-name-importer {
  background-color: #fff;
  border-radius: 4px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

h4 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.importer-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.description {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.file-upload-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-file-name {
  font-size: 14px;
  color: #666;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-success {
  background-color: #52c41a;
  color: white;
  align-self: flex-start;
}

.btn-link {
  background: none;
  border: none;
  color: #1890ff;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.import-result {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}

.import-result.success {
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
}

.import-result.error {
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
}

.import-result h5 {
  margin-top: 0;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.result-details {
  margin-top: 8px;
  display: flex;
  gap: 16px;
}

.result-details p {
  margin: 0;
}
</style> 
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
      
      <!-- 批处理进度显示 -->
      <div v-if="batchProgress.isProcessing" class="batch-progress">
        <div class="progress-header">
          <h6>批量处理进度</h6>
          <span class="progress-status">{{ batchProgress.currentBatch }} / {{ batchProgress.totalBatches }}</span>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: progressPercentage + '%' }"></div>
        </div>
        
        <!-- 等待计时器 -->
        <div v-if="batchProgress.isWaiting" class="waiting-timer">
          <div class="timer-icon">⏱️</div>
          <div class="timer-text">
            等待处理下一批次: 
            <span class="timer-countdown">{{ batchProgress.minutes }}分{{ batchProgress.seconds }}秒</span>
          </div>
        </div>
      </div>
      
      <div v-if="importResult" class="import-result" :class="{ 'success': importResult.success, 'error': !importResult.success }">
        <h5>导入结果</h5>
        <p>{{ importResult.message }}</p>
        <div v-if="importResult.data" class="result-details">
          <p>总数: {{ importResult.data.totalNum }}</p>
          <p>成功: {{ importResult.data.successNum }}</p>
          <p>失败: {{ importResult.data.failNum }}</p>
          
          <!-- 添加下载失败SKU按钮 -->
          <button 
            v-if="importResult.data.failNum > 0" 
            class="btn btn-download" 
            @click="downloadFailedSkus"
          >
            下载失败SKU
          </button>
        </div>
        
        <!-- 显示详细错误信息 -->
        <div v-if="importResult.data && importResult.data.resultMsg && importResult.data.failNum > 0" class="error-details">
          <h6>错误详情:</h6>
          <div class="error-message">
            <ul>
              <li v-for="(line, index) in formatErrorMessage(importResult.data.resultMsg)" :key="index">
                {{ line }}
              </li>
            </ul>
          </div>
        </div>
        
        <!-- 批次详情 -->
        <div v-if="importResult.data && importResult.data.batchResults && importResult.data.batchResults.length > 1" class="batch-details">
          <h6 @click="toggleBatchDetails" class="batch-toggle">
            批次详情 ({{ importResult.data.batchResults.length }}个批次)
            <span class="toggle-icon">{{ showBatchDetails ? '▼' : '►' }}</span>
          </h6>
          <div v-if="showBatchDetails" class="batch-list">
            <div v-for="(batch, index) in importResult.data.batchResults" :key="index" class="batch-item">
              <div class="batch-header">
                批次 {{ index + 1 }}:
                <span class="batch-stats">
                  总数: {{ batch.data?.totalNum || 0 }} | 
                  成功: {{ batch.data?.successNum || 0 }} | 
                  失败: {{ batch.data?.failNum || 0 }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import importProductNamesModule from '../../../features/warehouseLabeling/importProductNames.js'

const fileInputRef = ref(null)
const selectedFile = ref(null)
const isUploading = ref(false)
const importResult = ref(null)
const showBatchDetails = ref(false)

// 批处理进度状态
const batchProgress = ref({
  isProcessing: false,
  isWaiting: false,
  currentBatch: 0,
  totalBatches: 0,
  minutes: 0,
  seconds: 0
})

// 计算进度百分比
const progressPercentage = computed(() => {
  if (!batchProgress.value.totalBatches) return 0
  return Math.round((batchProgress.value.currentBatch / batchProgress.value.totalBatches) * 100)
})

// 切换批次详情显示
const toggleBatchDetails = () => {
  showBatchDetails.value = !showBatchDetails.value
}

// 事件监听处理函数
const handleProgressEvent = (event) => {
  const { total, current } = event.detail
  batchProgress.value.isProcessing = true
  batchProgress.value.totalBatches = total
  batchProgress.value.currentBatch = current
}

const handleWaitingEvent = (event) => {
  const { minutes, seconds } = event.detail
  batchProgress.value.isWaiting = true
  batchProgress.value.minutes = minutes
  batchProgress.value.seconds = seconds
}

const handleCompleteEvent = () => {
  batchProgress.value.isProcessing = false
  batchProgress.value.isWaiting = false
}

// 注册和移除事件监听
onMounted(() => {
  window.addEventListener('importProductNamesProgress', handleProgressEvent)
  window.addEventListener('importProductNamesWaiting', handleWaitingEvent)
  window.addEventListener('importProductNamesComplete', handleCompleteEvent)
})

onUnmounted(() => {
  window.removeEventListener('importProductNamesProgress', handleProgressEvent)
  window.removeEventListener('importProductNamesWaiting', handleWaitingEvent)
  window.removeEventListener('importProductNamesComplete', handleCompleteEvent)
})

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
  
  // 重置批处理状态
  batchProgress.value = {
    isProcessing: false,
    isWaiting: false,
    currentBatch: 0,
    totalBatches: 0,
    minutes: 0,
    seconds: 0
  }
  
  try {
    const result = await importProductNamesModule.execute(selectedFile.value)
    importResult.value = result
    
    // 只有完全成功才自动清除文件选择
    if (result.success && (!result.data || !result.data.failNum || result.data.failNum === 0)) {
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
    // 确保进度显示已完成
    batchProgress.value.isProcessing = false
    batchProgress.value.isWaiting = false
  }
}

// 格式化错误消息
const formatErrorMessage = (msg) => {
  if (!msg) return []
  
  const lines = msg.split('\n')
  // 去掉"商品自定义更新导入开始..."和"导入结束..."
  const errorLines = lines.filter(line => 
    line.trim() !== '' && 
    !line.includes('商品自定义更新导入开始') && 
    !line.includes('导入结束')
  )
  
  // 移除事业部相关信息，只保留错误原因
  const simplifiedLines = errorLines.map(line => {
    // 使用正则表达式移除"获取事业部【CBU...】、"这部分内容
    return line.replace(/获取事业部【[^】]+】、/, '')
  })
  
  return simplifiedLines
}

// 提取失败的SKU列表
const extractFailedSkus = (msg) => {
  if (!msg) return []
  
  const lines = msg.split('\n')
  const skuList = []
  
  // 正则表达式匹配商家商品标识【数字】
  const skuRegex = /商家商品标识【(\d+)】/
  
  lines.forEach(line => {
    const match = line.match(skuRegex)
    if (match && match[1]) {
      skuList.push(match[1])
    }
  })
  
  return skuList
}

// 下载失败的SKU
const downloadFailedSkus = () => {
  if (!importResult.value || !importResult.value.data || !importResult.value.data.resultMsg) {
    return
  }
  
  // 提取失败的SKU
  const failedSkus = extractFailedSkus(importResult.value.data.resultMsg)
  
  if (failedSkus.length === 0) {
    alert('没有找到失败的SKU信息')
    return
  }
  
  // 生成当前日期和时间字符串
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
  const fileName = `${dateStr}_${timeStr}_导入商品简称失败sku.txt`
  
  // 创建文件内容，每个SKU一行
  const content = failedSkus.join('\n')
  
  // 创建Blob对象
  const blob = new Blob([content], { type: 'text/plain' })
  
  // 创建临时下载链接
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  
  // 模拟点击下载
  document.body.appendChild(link)
  link.click()
  
  // 清理
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
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
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.result-details p {
  margin: 0;
}

.error-details {
  margin-top: 12px;
  border-top: 1px dashed #ffccc7;
  padding-top: 8px;
}

.error-details h6 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 500;
}

.error-message {
  max-height: 200px;
  overflow-y: auto;
  font-size: 13px;
}

.error-message ul {
  margin: 0;
  padding-left: 20px;
}

.error-message li {
  margin-bottom: 4px;
  line-height: 1.4;
}

.btn-download {
  background-color: #1e88e5;
  color: white;
  margin-left: auto;
  font-size: 12px;
  height: 28px;
  padding: 0 12px;
}

/* 批处理进度样式 */
.batch-progress {
  background-color: #f5f5f5;
  border-radius: 4px;
  padding: 12px;
  margin-top: 12px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-header h6 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.progress-status {
  font-size: 14px;
  color: #1976d2;
  font-weight: 500;
}

.progress-bar-container {
  height: 8px;
  background-color: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: #2196f3;
  transition: width 0.3s;
}

.waiting-timer {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 8px;
  background-color: #e8f4fd;
  border-radius: 4px;
  border-left: 3px solid #2196f3;
}

.timer-icon {
  margin-right: 8px;
  font-size: 16px;
}

.timer-text {
  font-size: 13px;
  color: #333;
}

.timer-countdown {
  font-weight: 500;
  color: #1976d2;
}

/* 批次详情样式 */
.batch-details {
  margin-top: 16px;
  border-top: 1px dashed #e0e0e0;
  padding-top: 12px;
}

.batch-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
}

.toggle-icon {
  font-size: 12px;
  color: #666;
}

.batch-list {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.batch-item {
  padding: 8px;
  border-radius: 4px;
  background-color: #f5f5f5;
  margin-bottom: 6px;
}

.batch-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.batch-stats {
  color: #666;
  font-size: 12px;
}
</style> 
<template>
  <div class="disabled-products">
    <div v-if="checking" class="status-checking">
      <div class="spinner"></div>
      <div>
        <div>正在检查商品状态 (批次 {{ currentBatch }}/{{ totalBatches }})...</div>
        <div class="progress-text">{{ progress }}</div>
      </div>
    </div>

    <div v-if="checkError" class="error-message">
      {{ checkError }}
    </div>

    <div v-if="items.length > 0" class="disabled-products-actions">
      <button class="btn btn-primary" @click="enableProducts" :disabled="enabling">
        {{ enabling ? '正在启用...' : '启用所有停用商品' }}
      </button>
      <span>共发现 {{ items.length }} 个停用商品</span>
    </div>

    <div v-if="items.length > 0" class="status-summary">
      <div class="status-detail">
        <i class="status-icon"></i>
        有
        <span class="status-count">{{ items.length }}</span>
        个商品处于停用状态，需要启用后才能正常销售
      </div>
      <div class="status-description">
        系统会自动收集所有停用商品，点击"启用所有停用商品"按钮可一键启用
      </div>
    </div>

    <table class="task-table" v-if="items.length > 0">
      <thead>
        <tr>
          <th style="width: 40px"><input type="checkbox" v-model="selectAll" /></th>
          <th>商品编号</th>
          <th>商品名称</th>
          <th>系统编号</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in items" :key="index">
          <td><input type="checkbox" v-model="selectedItems" :value="index" /></td>
          <td>{{ item.sellerGoodsSign || item.isvGoodsNo }}</td>
          <td>{{ item.shopGoodsName }}</td>
          <td>{{ item.shopGoodsNo }}</td>
          <td>
            <span class="status-tag failure">停用</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else-if="!checking" class="no-data">没有发现停用商品</div>

    <div v-if="enableError" class="error-message">启用错误: {{ enableError }}</div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  checking: {
    type: Boolean,
    default: false
  },
  enabling: {
    type: Boolean,
    default: false
  },
  checkError: {
    type: String,
    default: ''
  },
  enableError: {
    type: String,
    default: ''
  },
  currentBatch: {
    type: Number,
    default: 0
  },
  totalBatches: {
    type: Number,
    default: 0
  },
  progress: {
    type: String,
    default: '初始化...'
  }
})

const emit = defineEmits(['enable-products'])

const selectedItems = ref([])
const selectAll = computed({
  get: () => {
    return props.items.length > 0 && selectedItems.value.length === props.items.length
  },
  set: (value) => {
    selectedItems.value = value ? Array.from({ length: props.items.length }, (_, i) => i) : []
  }
})

// 清空选中项当items变化
watch(
  () => props.items,
  () => {
    selectedItems.value = []
  }
)

const enableProducts = () => {
  emit('enable-products', props.items)
}
</script>

<style scoped>
.disabled-products {
  width: 100%;
}

.status-checking {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 15px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #2196f3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
  margin-top: 2px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.progress-text {
  font-size: 12px;
  color: #606266;
  margin-top: 5px;
}

.error-message {
  color: #f56c6c;
  padding: 10px;
  background-color: #fef0f0;
  border-radius: 4px;
  margin-bottom: 15px;
}

.disabled-products-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.status-summary {
  background-color: #fef9e7;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 15px;
  border-left: 4px solid #f39c12;
}

.status-detail {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  margin-bottom: 5px;
}

.status-count {
  font-weight: bold;
  color: #e67e22;
}

.status-description {
  font-size: 12px;
  color: #7f8c8d;
}

.status-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  background-color: #f39c12;
  border-radius: 50%;
  position: relative;
}

.status-icon:after {
  content: '!';
  position: absolute;
  color: white;
  font-weight: bold;
  font-size: 12px;
  top: 0;
  left: 5px;
  line-height: 16px;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
}

.task-table th,
.task-table td {
  border-bottom: 1px solid #ebeef5;
  padding: 12px 0;
  text-align: left;
}

.task-table th {
  color: #909399;
  font-weight: 500;
  padding-bottom: 8px;
}

.no-data {
  text-align: center;
  color: #909399;
  padding: 30px 0;
}

.status-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 2px;
}

.status-tag.failure {
  background-color: #ffebee;
  color: #e53935;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
}
</style>

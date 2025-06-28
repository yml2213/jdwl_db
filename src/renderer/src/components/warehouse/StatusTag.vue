<template>
  <span class="status-tag" :class="statusClass">{{ displayText }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    required: true,
    default: '等待中'
  }
})

const statusClass = computed(() => {
  const status = props.status ? props.status.toLowerCase() : 'waiting'

  if (status.includes('成功') || status.includes('success')) {
    return 'success'
  }
  if (status.includes('失败') || status.includes('fail') || status.includes('error')) {
    return 'failure'
  }

  switch (status) {
    case '等待中':
    case 'waiting':
      return 'waiting'
    case '执行中':
    case 'processing':
      return 'processing'
    case '分批处理中':
    case 'batch-processing':
      return 'batch-processing'
    case '频率限制':
    case 'rate-limited':
      return 'rate-limited'
    case '部分成功':
    case 'partial-success':
      return 'partial-success'
    case '暂存':
    case 'temp-saved':
      return 'temp-saved'
    default:
      return 'waiting'
  }
})

const displayText = computed(() => {
  if (props.status === '分批处理中') {
    return '分批处理中'
  }
  if (props.status === '频率限制') {
    return '频率限制'
  }
  return props.status
})
</script>

<style scoped>
.status-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 12px;
  color: white;
  text-align: center;
  white-space: nowrap;
}

.waiting {
  background-color: #909399;
}

.processing {
  background-color: #409eff;
}

.batch-processing {
  background-color: #8e44ad;
  animation: pulsate 1.5s infinite alternate;
}

.success {
  background-color: #67c23a;
}

.failure {
  background-color: #f56c6c;
}

.rate-limited {
  background-color: #ff9900;
}

.partial-success {
  background-color: #e6a23c;
}

.temp-saved {
  background-color: #909399;
  border: 1px dashed #606266;
}

@keyframes pulsate {
  0% {
    opacity: 0.8;
  }
  100% {
    opacity: 1;
  }
}
</style>

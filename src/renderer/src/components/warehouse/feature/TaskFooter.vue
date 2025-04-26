<template>
  <div class="task-footer">
    <div class="form-group">
      <div class="input-group">
        <label>地区：</label>
        <select v-model="form.region">
          <option value="">请选择地区</option>
          <option v-for="region in regions" :key="region.value" :value="region.value">
            {{ region.label }}
          </option>
        </select>
      </div>
      <div class="input-group">
        <label>平台：</label>
        <select v-model="form.platform">
          <option value="">请选择平台</option>
          <option v-for="platform in platforms" :key="platform.value" :value="platform.value">
            {{ platform.label }}
          </option>
        </select>
      </div>
      <div class="input-group">
        <label>订单号：</label>
        <textarea
          v-model="form.orders"
          placeholder="请输入订单号，多个订单号请用换行分隔"
          @keydown.enter.ctrl.prevent="addTask"
        ></textarea>
      </div>
    </div>
    <div class="footer-actions">
      <button class="btn-add" @click="addTask">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'

defineProps({
  regions: {
    type: Array,
    default: () => []
  },
  platforms: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-task'])

const form = reactive({
  region: '',
  platform: '',
  orders: ''
})

function addTask() {
  // 验证表单是否填写完整
  if (!form.region || !form.platform || !form.orders.trim()) {
    return
  }

  // 处理多个订单号，按行分割
  const orders = form.orders.split('\n').filter((item) => item.trim())

  // 发送添加任务事件
  emit('add-task', {
    region: form.region,
    platform: form.platform,
    orders
  })

  // 清空表单
  form.orders = ''
}
</script>

<style scoped>
.task-footer {
  margin-top: 15px;
  padding: 15px;
  border-top: 1px solid #e8e8e8;
}

.form-group {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 15px;
}

.input-group {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 200px;
}

label {
  margin-bottom: 5px;
  font-weight: 500;
}

select,
textarea {
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

textarea {
  height: 80px;
  resize: vertical;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-add {
  padding: 8px 16px;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-add:hover {
  background-color: #40a9ff;
}
</style>

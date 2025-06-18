<template>
  <div class="form-group">
    <label class="form-label">采购入库</label>
    <div class="purchase-input-group">
      <label class="checkbox-label">
        <input type="checkbox" :checked="enable" @change="updateEnable" />
        <span>添加库存</span>
      </label>
      <div class="number-input">
        <input
          type="number"
          :value="quantity"
          @input="updateQuantity"
          min="1"
          :disabled="!enable"
          class="form-input-number"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  enable: {
    type: Boolean,
    default: false
  },
  quantity: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['update:enable', 'update:quantity'])

const updateEnable = (event) => {
  emit('update:enable', event.target.checked)
}

const updateQuantity = (event) => {
  const value = parseInt(event.target.value) || 1
  emit('update:quantity', Math.max(value, 1))
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

.purchase-input-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}

.number-input {
  flex: 0 0 120px;
}

.form-input-number {
  width: 100%;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
  text-align: center;
}

.form-input-number:disabled {
  background-color: #f5f7fa;
  color: #c0c4cc;
  cursor: not-allowed;
}
</style>

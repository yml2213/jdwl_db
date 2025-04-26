<template>
  <div class="form-group">
    <label class="form-label">等待时间</label>
    <div class="input-number-group">
      <button class="btn-dec" @click="decreaseValue">-</button>
      <input
        type="number"
        :value="modelValue"
        @input="updateValue"
        min="1"
        class="form-input-number"
      />
      <button class="btn-inc" @click="increaseValue">+</button>
      <span class="unit">秒</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Number,
    default: 5
  },
  min: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['update:modelValue'])

const updateValue = (event) => {
  const value = parseInt(event.target.value) || props.min
  emit('update:modelValue', Math.max(value, props.min))
}

const decreaseValue = () => {
  if (props.modelValue > props.min) {
    emit('update:modelValue', props.modelValue - 1)
  }
}

const increaseValue = () => {
  emit('update:modelValue', props.modelValue + 1)
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

.input-number-group {
  display: flex;
  align-items: center;
}

.form-input-number {
  width: 80px;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 0;
  padding: 0 12px;
  text-align: center;
}

.btn-dec,
.btn-inc {
  width: 36px;
  height: 36px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  font-size: 16px;
  cursor: pointer;
}

.btn-dec {
  border-radius: 4px 0 0 4px;
}

.btn-inc {
  border-radius: 0 4px 4px 0;
}

.unit {
  margin-left: 8px;
  color: #606266;
}
</style>

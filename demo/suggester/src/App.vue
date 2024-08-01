

<template>
  <div>
    <a href="https://github.com/devforth/vue-suggestion-input" target="_blank" style="margin-bottom: 5rem;">vue-suggestion-input on GitHub</a>


    <SuggestionInput 
        class="input"
        v-model="currentValue"
        type="string"
        :completionRequest="complete"
        :debounceTime="300"
        placeholder="Type something..."
    />

  </div>
</template>

<style scoped>

.input {
  width: 300px;
  font-size: 16px;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 5px;
}
</style>


<script setup lang="ts">

import SuggestionInput from '../../../lib/suggestion-input.vue';
import { ref } from 'vue';

const currentValue = ref('');


async function complete() {
  // simulate delay
  await new Promise((resolve) => setTimeout(resolve, 400));

  // generate N random words of M length
  const numOfWords = Math.floor(Math.random() * 7) + 1;
  const words = Array.from({ length: numOfWords }, () => Math.random().toString(36).substring(2, 15));
  return words.join(' ');
}

</script>
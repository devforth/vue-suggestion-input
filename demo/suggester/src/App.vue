

<template>
  <div>
    <a href="https://github.com/devforth/vue-suggestion-input" target="_blank" style="margin-bottom: 5rem;">vue-suggestion-input on GitHub</a>


    <SuggestionInput 
        class="input"
        v-model="currentValue"
        type="text"
        :completionRequest="complete"
        :debounceTime="300"
        placeholder="Type something..."
    />

    <div class="cv">Current value:</div>
    <pre>{{ currentValue }}</pre>
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

.cv {
  margin-top: 2rem;
  font-size: 1rem;
}

pre {
  font-size: 1rem;
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 5px;
  white-space: normal;
}
</style>


<script setup lang="ts">

import SuggestionInput from '../../../lib/suggestion-input.vue';
import { ref } from 'vue';

const currentValue = ref('');


async function complete(textBeforeCursor: string): Promise<string[]> {
  console.log('✋ complete request', textBeforeCursor);

  // simulate delay
  await new Promise((resolve) => setTimeout(resolve, 400));

  // generate N random words of M length
  const numOfWords = Math.floor(Math.random() * 7) + 1;
  const words = Array.from({ length: numOfWords }, () => Math.random().toString(36).substring(2, 15));

  // if textBeforeCursor has "br" in end - insert \n in random word at random place
  if (textBeforeCursor.endsWith('br')) {
    const randomWordIndex = Math.floor(Math.random() * words.length);
    const pos = Math.floor(Math.random() * words[randomWordIndex].length);
    words[randomWordIndex] = words[randomWordIndex].substring(0, pos) + '\n' + words[randomWordIndex].substring(pos);
  }

  return words.map((word) => `${word} `);
}

</script>
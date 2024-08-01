<template>
  <div  
      ref="editor"
      @click="startCompletionIfEmpty"
      @keydown.tab.prevent.stop="approveCompletion('all')"
      @keydown.ctrl.right.prevent.stop="approveCompletion('word')"
      @keydown.ctrl.down.prevent.stop="startCompletion()"
      :data-with-complete="completion !== null"
      :class="`type-${props.type}`"
  >
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from "vue";
import Quill from "quill";

const BlockEmbed = Quill.import('blots/block/embed');

function dbg(...args: any[]) {
  return;
  console.log(...args);
}

// @ts-ignore
class CompleteBlot extends BlockEmbed {
  static blotName = 'complete';
  static tagName = 'span';

  static create(value: { text: string }) {
    let node = super.create();
    node.setAttribute('contenteditable', 'false');
    node.setAttribute('completer', '');
    node.setAttribute('style', `opacity: 0.5`);
    node.innerText = value.text;
    return node;
  }
  
  static value(node: HTMLElement) {
    return {
      text: node.innerText,
    };
  }
}
// @ts-ignore
Quill.register(CompleteBlot);

interface Props {
  modelValue: string;
  completionRequest: () => Promise<string>;
  debounceTime: number;
  delimiter: string;
  type: 'string' | 'json';
  placeholder: string;
}

const props = withDefaults(
  defineProps<Props>(), {
    debounceTime: 300,
    delimiter: '\n',
    type: 'string',
  }
);

const emit = defineEmits([
  'update:modelValue',
]);

const editor = ref<HTMLElement>();
const completion = ref<string | null>(null);
let quill: any = null;

let lastText: string | null = null;


async function emitTextUpdate() {
  let text = quill.getText();

  if (props.type === 'string' && text.includes('\n\n')) {
    const pos = quill.getSelection();
    const newText = text.replace(/\n\n/g, '');
    quill.setText(newText, 'silent');
    quill.setSelection(pos.index, 0, 'silent');
    text = quill.getText();
  }
  
  text = text.replace(/\n$/g, '');

  if (lastText === text) {
    return;
  }

  lastText = text;

  dbg('🪽 Text changed in suggestion-input, new text', JSON.stringify(text));
  await (new Promise((resolve) => setTimeout(resolve, 0)));

  dbg('💥 1️⃣ emit value suggestion-input', JSON.stringify(text));
  emit('update:modelValue', text);
}

watch(() => props.modelValue, (value: string) => {
  if (value !== lastText) {
    dbg('💨 external text update', JSON.stringify(value), 'we have text', JSON.stringify(lastText));

    quill.setText(value, 'silent');
    lastText = value;
  }
});


onMounted(async () => {
  dbg('props type', props.type);
  dbg('props modelValue', props.modelValue);
  quill = new Quill(editor.value as HTMLElement, {
    theme: "snow",
    placeholder: props.placeholder || 'Type here...',
    formats : ['complete'],
    modules: {
      toolbar: null,
      keyboard: {
        bindings: {
          tab: {
            key: 9,
            handler: function (range: any, context: any) {
              if (completion.value !== null) {
                return true;
              }
            },
          },
        },
      }
    },
  });

  quill.setText(props.modelValue, 'silent');
  lastText = quill.getText();

  quill.on(Quill.events.TEXT_CHANGE, async (delta: any, oldDelta: any, source: string) => {
    dbg('🪽 TEXT_CHANGE fired ', JSON.stringify(delta, null, 1), JSON.stringify(oldDelta, null, 1), source);
    emitTextUpdate();
    // allow update to propagate
    startCompletion();
  });
  
  quill.on('selection-change', (range: any, oldRange: any, source: string) => {
    dbg('🪽 selection changed', range, oldRange, source);
    const text = quill.getText();
    // don't allow to select after completion
    if (range?.index === text.length) {
      quill.setSelection(text.length - 1, 0, 'silent');
    }
  });
});

onUnmounted(() => {
  quill.off(Quill.events.TEXT_CHANGE);
  quill.off('selection-change');
});


let tmt: null | ReturnType<typeof setTimeout> = null;

async function startCompletion() {
  completion.value = null;

  if (tmt) {
    clearTimeout(tmt);
  }
  tmt = setTimeout(async () => {
    let completionAnswer = await props.completionRequest();
    if (props.type === 'string') {
      completionAnswer = completionAnswer.replace(/\n/g, ' ');
    }
    const d = quill.getContents();
    const lastIsComplete = d.ops[d.ops.length - 1].insert.complete;
    const cursorPosition = quill.getSelection();

    if (!lastIsComplete) {
      dbg('✅ No completion yet, adding');
      d.ops.push({ insert: { complete: { text: completionAnswer } } });
    } else {
      dbg('✅ Completion already exists, updating');
      d.ops[d.ops.length - 1].insert.complete.text = completionAnswer
    }
    quill.setContents(d, "silent");
    quill.setSelection(cursorPosition.index, cursorPosition.length, 'silent');

    completion.value = completionAnswer;

  }, props.debounceTime || 300);
}

function startCompletionIfEmpty() {
  const d = quill.getContents();
  if (!d.ops[d.ops.length - 1].insert.complete) {
    startCompletion();
  }
}

function approveCompletion(type: 'all' | 'word') { 
  dbg('🪽 approveCompletion')

  const ops = quill.getContents().ops;
  if (!completion.value) {
    return;
  }
  
  const someTextIsInInout = ops.length >= 2;

  if (someTextIsInInout && typeof ops[ops.length - 2].insert !== 'string') {
    return;
  }
  
  dbg(`💨 d before compl ${JSON.stringify(ops)}`);

  // before completion we need to remove last new line, it is added by quill
  ops[ops.length - 2].insert = ops[ops.length - 2].insert.replace(/\n$/g, '');

  let needComplete = false;
  if (type === 'all') {
    if (someTextIsInInout) {
      ops[ops.length - 2].insert += completion.value;
    } else {
      ops.push({ insert: completion.value });
    }

    quill.setContents({ ops }, 'silent');

    needComplete = true;
    
  } else {
    const firstWord = completion.value.split(' ')[0] + ' ';
    const newCompletion = completion.value.slice(firstWord.length);
    ops[ops.length - 2].insert += firstWord;

    // update completion
    ops[ops.length - 1].insert.complete.text = newCompletion;
    quill.setContents({ ops }, 'silent');

    if (newCompletion.length === 0) {
      needComplete = true;
    }
  }
  dbg(`💨 d after compl ${JSON.stringify(ops)}`);

  // set cursor to the end
  const textNew = quill.getText();
  quill.setSelection(textNew.length, 0, 'silent');
  emitTextUpdate();

  if (needComplete) {
    startCompletion();
  }
}

</script>

<style lang="scss">
.ql-editor {
  outline: none;
  &:focus {
    outline: none;
  }
}

.ql-container[data-with-complete="true"] .ql-editor {
  p:last-of-type br {
    display: none;
  }

  p:last-of-type {
    display: inline;
  }
}

.ql-container[data-with-complete="false"] [completer] {
  display: none;
}

.ql-editor:not(:focus) [completer] {
  display: none;
}

.type-string {
  .ql-editor {
  }
}
</style>
<template>
  <div  
      ref="editor"
      @keydown.tab.prevent.stop="approveCompletion('all')"
      @keydown.ctrl.right.prevent.stop="approveCompletion('word')"
      @keydown.ctrl.down.prevent.stop="startCompletion()"
      :class="`type-${props.type}`"
  ></div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from "vue";
import Quill from "quill";
import "quill/dist/quill.core.css";
import AsyncQueue from "./async-queue.js";

const BlockEmbed = Quill.import('blots/block/embed');

function dbg(title: string,...args: any[]) {
  // return; // comment for debug
  console.log(title, ...args.map(a =>JSON.stringify(a, null, 1))); 
}

// @ts-ignore
class CompleteBlot extends BlockEmbed {
  static blotName = 'complete';
  static tagName = 'span';

  static create(value: { text: string }) {
    let node = super.create();
    node.setAttribute('contenteditable', 'false');
    node.setAttribute('completer', '');
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


const updaterQueue = new AsyncQueue();


interface Props {
  modelValue: string;
  completionRequest: (textBeforeCursor: string) => Promise<string[]>;
  debounceTime?: number;
  delimiter?: string;
  type?: 'string' | 'text';
  placeholder?: string;
}

const props = withDefaults(
  defineProps<Props>(), {
    debounceTime: 300,
    delimiter: '\n',
    type: 'string',
    placeholder: 'Type here...',
  }
);

const emit = defineEmits([
  'update:modelValue',
]);

const editor = ref<HTMLElement>();
const completion = ref<string[] | null>(null);
let quill: any = null;
const editorFocused = ref(false);

let lastText: string | null = null;


function removeCompletionOnBlur() {
  if (lastText?.trim().length === 0) {
    completion.value = null;
    const d = quill.getContents();
    const i = d.ops.findIndex((op: any) => op.insert.complete);
    if (i !== -1) {
      d.ops.splice(i, 1);
      quill.setContents(d, 'silent');
      dbg('🧹 Cleaned completion from ops to make ph visible');
    }
  }
}

async function emitTextUpdate() {
  let text = quill.getText();

  if (props.type === 'string' && text.includes('\n\n')) {
    // allow position to stabilize, otherwise pos will be wrong (to reproduce click when completion is shown)
    await (new Promise((resolve) => setTimeout(resolve, 0)));

    const pos = quill.getSelection();
    dbg('🧹 remove double new lines', text, pos);
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

  await (new Promise((resolve) => setTimeout(resolve, 0)));

  dbg('⬆️ emit value suggestion-input', text);
  emit('update:modelValue', text);
}

watch(() => props.modelValue, (value: string) => {
  if (value !== lastText) {
    dbg('🔽 external text update (watch modelValue)', value, 'we have text', lastText);
    quill.setText(value, 'silent');
    lastText = value;
  }
});

let xDown: null | number = null;
let yDown: null | number = null;

function handleTouchStart(evt: TouchEvent) {
  xDown = evt.touches[0].clientX;
  yDown = evt.touches[0].clientY;
}

function handleTouchMove(evt: TouchEvent) {
  if (!xDown || !yDown) {
    return;
  }

  let xUp = evt.touches[0].clientX;
  let yUp = evt.touches[0].clientY;

  let xDiff = xDown - xUp;
  let yDiff = yDown - yUp;

  if (Math.abs(xDiff) > Math.abs(yDiff)) {
    if (xDiff < 0) {
      // complete word if completion and input is focused
      dbg('👇 swipe right', completion.value, editorFocused.value);
      if (completion.value !== null && editorFocused.value) {
        approveCompletion('word');
        // [Intervention] Unable to preventDefault inside passive event listener due to target being treated as passive. See https://www.chromestatus.com/feature/5093566007214080
        // evt.preventDefault();
        evt.stopPropagation();
      }
    }
  }

  xDown = null;
  yDown = null;
}

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
    dbg('🪽 TEXT_CHANGE fired ', delta, oldDelta, source);
    updaterQueue.add(emitTextUpdate);
    startCompletion();
  });
  
  quill.on('selection-change', (range: any, oldRange: any, source: string) => {
    dbg('🪽 selection changed', range, oldRange, source);
    if (range === null) {
      // blur event
      removeCompletionOnBlur();
      editorFocused.value = false;
      return;
    } else {
      editorFocused.value = true;
      startCompletion();
    }
    const text = quill.getText();
    // don't allow to select after completion
    if (range?.index === text.length) {
      dbg('✋ prevent selection after completion');
      quill.setSelection(text.length - 1, 0, 'silent');
    }
  });


  // handle right swipe on mobile uding document/window, and console log if swiped in right direction
  if ('ontouchstart' in window) {
    document.addEventListener('touchstart', handleTouchStart, false);
    document.addEventListener('touchmove', handleTouchMove, false);
  }
});

onUnmounted(() => {
  quill.off(Quill.events.TEXT_CHANGE);
  quill.off('selection-change');

  if ('ontouchstart' in window) {
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('touchmove', handleTouchMove);
  }
});


// how to get completer blot
// const blot = quill.getLine(cursorPosition.index);
// const completeOnRightPlace = blot?.domNode?.querySelector('[completer]') !== null;

let tmt: null | ReturnType<typeof setTimeout> = null;

async function startCompletion() {
  completion.value = null;
  // return;
  deleteCompleteEmbed();

  if (tmt) {
    clearTimeout(tmt);
  }
  tmt = setTimeout(async () => {
    const currentTmt = tmt;
    const cursorPosition = quill.getSelection();
    dbg('👇 get pos', cursorPosition.index, cursorPosition.length)
    if (cursorPosition.length !== 0) {
      // we will not complete if text selected
      return;
    }

    const charAfterCursor = quill.getText(cursorPosition.index, 1);
    dbg('👇 charAfterCursor', charAfterCursor);
    if (charAfterCursor !== '\n') {
      // we will not complete if not at the end of the line
      return;
    }

    const textBeforeCursor = quill.getText(0, cursorPosition.index);

    const completionAnswer = await props.completionRequest(textBeforeCursor);
    if (currentTmt !== tmt) {
      // while we were waiting for completion, new completion was started
      return;
    }
    

    if (props.type === 'string') {
      completionAnswer.map((word, i) => {
        completionAnswer[i] = word.replace(/\n/g, ' ');
      });
    }


    // deleteCompleteEmbed();
    // insert on +1 to insert after \n
    quill.insertEmbed(cursorPosition.index + 1, 'complete', { text: completionAnswer.join('') }, 'silent');

    dbg('👇 set pos', cursorPosition.index, cursorPosition.length)
    quill.setSelection(cursorPosition.index, cursorPosition.length, 'silent');

    completion.value = completionAnswer;

    dbg('👇 completion finished', quill.getContents());

  }, props.debounceTime || 300);
}

function updateCompleteEmbed(text: string) {
  const curCursorPos = quill.getSelection();
  const d = quill.getContents();
  const c = d.ops.find((op: any) => op.insert.complete);
  if (!c) {
    return;
  }
  c.insert.complete.text = text;
  quill.setContents(d.ops, 'silent');
  quill.setSelection(curCursorPos.index, curCursorPos.length, 'silent');
}

function deleteCompleteEmbed() {
  const completeNode = quill.root.querySelector('[completer]');
  const completeBlot = Quill.find(completeNode);
  const blotIdx: number | null = completeBlot ? quill.getIndex(completeBlot) : null;

  dbg('👇 complete blot idx', blotIdx);

  if (blotIdx !== null) {
    quill.deleteText(blotIdx, 1, 'silent');
  }
}

function approveCompletion(type: 'all' | 'word') { 
  dbg('💨 approveCompletion')

  if (completion.value === null) {
    return;
  }

  const cursorPosition = quill.getSelection();

  let shouldComplete = false;
  if (type === 'all') {
    quill.insertText(cursorPosition.index, completion.value.join(''), 'silent');
    shouldComplete = true;
  } else {
    const word = completion.value[0];
    quill.insertText(cursorPosition.index, word, 'silent');
    completion.value = completion.value.slice(1);
    if (completion.value.length === 0) {
      shouldComplete = true;
    } else {
      // update completion
      // TODO probably better way to update Embed?
      updateCompleteEmbed(completion.value.join(''));
    }
  }

  updaterQueue.add(emitTextUpdate);

  if (shouldComplete) {
    startCompletion();
  }

}

</script>

<style lang="scss">

.ql-editor {
  position: relative;
  outline: none;
  padding: 0;
  &:focus {
    outline: none;
  }

  &.ql-blank::before {
    left: 0px;
    font-style: normal;
  }
}

p:has(+ [completer]) br {
  display: none;
}
p:has(+ [completer]) {
  // background: rgb(255 227 227);  // debug
  display: inline;
}

.ql-editor:not(:focus) [completer] {
  display: none;
}

.ql-editor [completer] {
  // important to keep pointer-events non none for cursor position on completer click

  // text is not selectable
  user-select: none;
  color: gray;

  // if inline or inline used then user-select: none brakes triple click
  display: contents;

  font-style: italic;
}

</style>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../celebration.js', import.meta.url), 'utf8');

class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type) {
    const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
}

function fixture({ unlocked = true, reduced = false, hidden = false, intersectionObserver = true } = {}) {
  const document = new Events();
  class Element extends Events {
    constructor({ memory = false } = {}) {
      super();
      this.classes = new Set();
      this.classList = {
        add: name => this.classes.add(name),
        remove: name => this.classes.delete(name),
        contains: name => this.classes.has(name)
      };
      this.children = [];
      this.focusCalls = [];
      this.memory = memory;
    }
    contains(element) { return this === element || this.children.includes(element); }
    matches() { return this.memory; }
    querySelectorAll() { return this.children.filter(element => element.memory); }
    focus(options) { document.activeElement = this; this.focusCalls.push(options); }
  }

  document.body = new Element();
  document.documentElement = new Element();
  document.documentElement.clientWidth = 900;
  document.documentElement.clientHeight = 700;
  if (unlocked) document.documentElement.classList.add('unlocked');
  document.hidden = hidden;
  document.activeElement = document.body;
  const page = new Element();
  const memory = new Element({ memory: true });
  page.children.push(memory);
  const title = new Element();
  const button = new Element();
  const intro = new Element();
  intro.children.push(button);
  intro.open = false;
  intro.showCalls = 0;
  intro.closeCalls = 0;
  intro.showModal = () => {
    intro.previousFocus = document.activeElement;
    intro.open = true;
    intro.showCalls += 1;
    document.activeElement = intro;
  };
  intro.close = () => {
    if (!intro.open) return;
    intro.open = false;
    intro.closeCalls += 1;
    document.activeElement = intro.previousFocus;
    intro.dispatch('close');
  };

  const context = {
    setTransform() {}, clearRect() {}, save() {}, translate() {}, rotate() {}, fillRect() {}, restore() {}
  };
  const canvas = new Element();
  canvas.hidden = true;
  canvas.style = {};
  canvas.getContext = () => context;
  canvas.closest = () => intro;
  const ids = new Map([
    ['page', page], ['birthday-title', title], ['intro-continue', button],
    ['birthday-intro', intro], ['birthday-confetti', canvas]
  ]);
  document.getElementById = id => ids.get(id) || null;
  document.querySelector = () => intro.open ? intro : null;

  const motion = new Events();
  motion.matches = reduced;
  const window = new Events();
  const timers = new Map();
  const frames = new Map();
  let nextId = 0;
  const observers = [];
  Object.assign(window, {
    innerWidth: 900, innerHeight: 700, devicePixelRatio: 3,
    matchMedia: () => motion,
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  if (intersectionObserver) {
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.elements = new Set(); observers.push(this); }
      observe(element) { this.elements.add(element); }
      unobserve(element) { this.elements.delete(element); }
      disconnect() { this.elements.clear(); }
    };
  }
  vm.runInNewContext(source, { window, document, Set, Array, Boolean, Math });

  return {
    api: window.BirthdayCelebration, document, window, page, memory, title, button, intro, canvas, timers, frames,
    runTimers() {
      const scheduled = [...timers.values()];
      timers.clear();
      scheduled.forEach(timer => timer.callback());
    },
    runFrame(time) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(time));
    },
    hide() { document.hidden = true; document.dispatch('visibilitychange'); },
    reduceMotion() { motion.matches = true; motion.dispatch('change'); },
    intersect(element) {
      observers.forEach(observer => {
        if (observer.elements.has(element)) observer.callback([{ target: element, isIntersecting: true }]);
      });
    }
  };
}

test('welcome stays open after scheduled work instead of dismissing on a timer', () => {
  const page = fixture();
  page.api.start();
  page.runTimers();
  assert.equal(page.intro.open, true);
  assert.equal(page.title.focusCalls.length, 0);
  assert.equal(page.document.body.classList.contains('is-celebrating'), true);
});

test('Escape is prevented and keeps the required welcome open', () => {
  const page = fixture();
  page.api.start();
  const cancel = page.intro.dispatch('cancel');
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(page.intro.open, true);
  assert.equal(page.title.focusCalls.length, 0);
});

test('hiding the tab stops confetti but keeps the welcome open', () => {
  const page = fixture();
  page.api.start();
  assert.equal(page.canvas.hidden, false);
  page.hide();
  assert.equal(page.intro.open, true);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.canvas.width, 1);
  assert.equal(page.document.body.classList.contains('is-celebrating'), true);
});

test('enabling reduced motion reveals pending content and stops confetti without dismissing welcome', () => {
  const page = fixture();
  page.api.start();
  assert.equal(page.memory.classList.contains('reveal-pending'), true);
  page.reduceMotion();
  assert.equal(page.intro.open, true);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.memory.classList.contains('reveal-pending'), false);
  assert.equal(page.memory.classList.contains('is-revealed'), true);
  assert.equal(page.title.focusCalls.length, 0);
});

test('reduced-motion visitors still receive the welcome with no confetti', () => {
  const page = fixture({ reduced: true });
  page.api.start();
  assert.equal(page.intro.open, true);
  assert.equal(page.document.activeElement, page.button);
  assert.equal(page.frames.size, 0);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.memory.classList.contains('is-revealed'), true);
});

test('opening in a background tab still waits for the Continue button', () => {
  const page = fixture({ hidden: true });
  page.api.start();
  assert.equal(page.intro.open, true);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.title.focusCalls.length, 0);
});

test('Continue dismisses once, restores title focus without scrolling and cleans confetti', () => {
  const page = fixture();
  page.api.start();
  page.api.start();
  assert.equal(page.intro.showCalls, 1);
  page.button.dispatch('click');
  page.button.dispatch('click');
  assert.equal(page.intro.open, false);
  assert.equal(page.intro.closeCalls, 1);
  assert.equal(page.document.activeElement, page.title);
  assert.equal(page.title.focusCalls.length, 1);
  assert.equal(page.title.focusCalls[0].preventScroll, true);
  assert.equal(page.document.body.classList.contains('is-celebrating'), false);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.timers.size, 0);
});

test('Continue does not steal focus if the welcome no longer owns it', () => {
  const page = fixture();
  page.api.start();
  page.document.activeElement = page.memory;
  page.button.dispatch('click');
  assert.equal(page.title.focusCalls.length, 0);
  assert.equal(page.intro.open, false);
});

test('pre-birthday calls never open the welcome or start animation', () => {
  const page = fixture({ unlocked: false });
  page.api.start();
  page.api.start();
  assert.equal(page.intro.showCalls, 0);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.page.classList.contains('celebration-ready'), false);
  assert.equal(page.memory.classList.contains('reveal-pending'), false);
});

test('confetti ends within five seconds while the welcome keeps waiting', () => {
  const page = fixture();
  page.api.start();
  assert.equal(page.canvas.width, 1800);
  page.runFrame(0);
  page.runFrame(4500);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.intro.open, true);
});

test('viewport reveals happen once and unsupported observers keep content visible', () => {
  const page = fixture();
  page.api.start();
  page.intersect(page.memory);
  assert.equal(page.memory.classList.contains('is-revealed'), true);
  assert.equal(page.memory.classList.contains('reveal-pending'), false);
  page.api.observe(page.memory);
  assert.equal(page.memory.classList.contains('reveal-pending'), false);

  const fallback = fixture({ intersectionObserver: false });
  fallback.api.start();
  assert.equal(fallback.memory.classList.contains('is-revealed'), true);
  assert.equal(fallback.memory.classList.contains('reveal-pending'), false);
});

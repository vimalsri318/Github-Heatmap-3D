import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg, getAnimation } from '../src/lib/svg.js';
import { demoContributions, sampleContributions } from '../src/lib/data.js';
import { parseOptions } from '../src/lib/options.js';

const svg = (query, days = demoContributions(2025)) => renderSvg(days, parseOptions(new URLSearchParams(query)));
const count = (s, re) => (s.match(re) || []).length;

test('still image has no animation', () => {
  const s = svg('');
  assert.equal(count(s, /<animate/g), 0);
  assert.equal(count(s, /<clipPath/g), 0);
});

test('animate=grow: one rising bar per active day, plays once', () => {
  const days = sampleContributions(2025);
  const active = days.filter((d) => d.count > 0).length;
  const s = svg('animate=grow', days);
  assert.equal(count(s, /<clipPath id=/g), active);
  assert.equal(count(s, /<animateTransform/g), active + 1); // + the light sweep
  assert.match(s, /fill="freeze"/);
});

test('animate=loop repeats forever', () => {
  const s = svg('animate=loop');
  assert.ok(count(s, /repeatCount="indefinite"/g) > 300);
  assert.doesNotMatch(s, /fill="freeze"/);
});

test('keyTimes start at 0, end at 1 and never go backwards', () => {
  for (const mode of ['grow', 'loop']) {
    for (const [, k] of svg(`animate=${mode}`).matchAll(/keyTimes="([^"]+)"/g)) {
      const t = k.split(';').map(Number);
      assert.equal(t[0], 0);
      assert.equal(t.at(-1), 1);
      t.forEach((v, i) => i && assert.ok(v >= t[i - 1], `${mode}: ${k}`));
    }
  }
});

test('values, keyTimes and keySplines agree in length', () => {
  for (const [, k, s, v] of svg('animate=loop').matchAll(/keyTimes="([^"]+)" keySplines="([^"]+)" values="([^"]+)"/g)) {
    assert.equal(v.split(';').length, k.split(';').length);
    assert.equal(s.split(';').length, k.split(';').length - 1);
  }
});

test('ids are unique', () => {
  const ids = [...svg('animate=grow').matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('tags are balanced (well-formed enough for an <img>)', () => {
  const s = svg('animate=loop');
  for (const tag of ['svg', 'g', 'clipPath', 'defs', 'mask', 'linearGradient', 'path', 'text']) {
    const open = count(s, new RegExp(`<${tag}[\\s>]`, 'g'));
    const closed = count(s, new RegExp(`</${tag}>`, 'g')) + count(s, new RegExp(`<${tag}[^>]*/>`, 'g'));
    assert.equal(open, closed, tag);
  }
});

test('animation stays a reasonable size for a busy year', () => {
  assert.ok(svg('animate=loop').length < 300_000);
});

test('animate values', () => {
  assert.equal(getAnimation('1'), 'grow');
  assert.equal(getAnimation('loop'), 'loop');
  assert.equal(getAnimation('0'), null);
  assert.equal(getAnimation('<script>'), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { clamp, isNonEmptyString, toArray } from '../src/index.js';

test('isNonEmptyString', () => {
  assert.equal(isNonEmptyString('value'), true);
  assert.equal(isNonEmptyString('  '), false);
  assert.equal(isNonEmptyString(null), false);
});

test('toArray', () => {
  assert.deepEqual(toArray(undefined), []);
  assert.deepEqual(toArray('value'), ['value']);
  assert.deepEqual(toArray([1, 2]), [1, 2]);
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

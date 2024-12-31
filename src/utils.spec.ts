import assert from 'node:assert/strict';
import test from 'node:test';
import { add } from './utils.js';

test('add function should return sum of two numbers', () => {
  const result = add(2, 3);
  assert.strictEqual(result, 5, '2 + 3 should equal 5');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('login password can be shown and hidden accessibly', () => {
  const source = fs.readFileSync('src/app/login/page.tsx', 'utf8');
  assert.match(source, /const \[showPassword, setShowPassword\] = useState\(false\)/);
  assert.match(source, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(source, /aria-pressed=\{showPassword\}/);
  assert.match(source, /aria-label=\{`\$\{showPassword \? "Hide" : "Show"\} password`\}/);
});

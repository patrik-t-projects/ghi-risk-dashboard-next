import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function compile(file, require = () => { throw Error('Unexpected dependency'); }, extras = {}) {
  const context = { exports: {}, require, ...extras };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
}
const targets = compile('src/lib/uploadTargets.ts');
const { resolveUploadTarget } = targets;

test('existing HTML slots remain unchanged', () => {
  for (const [id, filename] of [['icon-forecast', 'icon_forecast.html'], ['imbalance-ch', 'imbalance_dashboard.html']]) {
    const target = resolveUploadTarget(id, null);
    assert.equal(target.bucket, 'dashboard-html');
    assert.equal(target.path, filename);
    assert.equal(target.contentType, 'text/html; charset=utf-8');
  }
});

test('daily files use one date-specific path; past dates remain uploadable', () => {
  for (const day of ['2026-09-12', '2026-09-13', '2024-02-29', '2025-01-01']) {
    const target = resolveUploadTarget('forecast-daily', day);
    assert.equal(target.bucket, 'forecast-data');
    assert.equal(target.path, `daily/icon_ghi_all_stations_${day}.csv`);
    assert.equal(target.contentType, 'text/csv; charset=utf-8');
  }
});

const swissgridTargets = [
  ['control-area-balance-yearly', 'swissgrid/control-area-balance-yearly.csv'],
  ['control-area-balance-today', 'swissgrid/control-area-balance-today.csv'],
];

test('Swissgrid CSV targets use exact paths without a date parameter', () => {
  for (const [id, path] of swissgridTargets) {
    const target = resolveUploadTarget(id, null);
    assert.equal(target.bucket, 'forecast-data');
    assert.equal(target.path, path);
    assert.equal(target.contentType, 'text/csv; charset=utf-8');
    assert.equal(resolveUploadTarget(id, '2026-09-19'), null);
  }
});

test('upload authorization signs both Swissgrid paths with overwrite enabled', async () => {
  for (const [id, path] of swissgridTargets) {
    const signed = {};
    const route = compile('src/app/api/dashboard-upload/route.ts', name => {
      if (name === 'node:crypto') return crypto;
      if (name === '@/lib/uploadTargets') return targets;
      if (name === '@supabase/supabase-js') return { createClient: (url, key) => {
        signed.url = url; signed.key = key;
        return { storage: { from: bucket => {
          signed.bucket = bucket;
          return { createSignedUploadUrl: async (storagePath, options) => {
            signed.path = storagePath; signed.upsert = options.upsert;
            return { data: { signedUrl: `https://storage.example/upload/${id}` }, error: null };
          } };
        } } };
      } };
      throw Error(name);
    }, { Buffer, URL, Response, console, process: { env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'server-secret', PI_UPLOAD_TOKEN: 'pi-token',
    } } });
    const response = await route.POST(new Request(`https://dashboard.example/api/dashboard-upload?dashboard=${id}`, {
      method: 'POST', headers: { Authorization: 'Bearer pi-token' },
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(signed.bucket, 'forecast-data');
    assert.equal(signed.path, path);
    assert.equal(signed.upsert, true);
    assert.equal(body.path, path);
    assert.equal(body.uploadUrl, `https://storage.example/upload/${id}`);
    assert.equal(body.contentType, 'text/csv; charset=utf-8');
    assert.equal(body.method, 'PUT');
  }
});

test('rejects malformed dates, invalid calendar days, unknown targets and path injection', () => {
  for (const day of [null, '', '2026-02-29', '2026-09-31', '2026-13-01', '2026-9-1', '../2026-09-12', '2026-09-12/other.csv']) {
    assert.equal(resolveUploadTarget('forecast-daily', day), null);
  }
  for (const id of [null, '__proto__', 'constructor', 'historical', '../other']) assert.equal(resolveUploadTarget(id, '2026-09-12'), null);
});

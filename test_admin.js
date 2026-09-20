// Proves the admin gate is real: run `node test_admin.js`.
// Spawns its own server on a throwaway DB, so it never touches components.db.
import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PW = 'test-password';
const PORT = 3999;
const URL = `http://localhost:${PORT}/api`;
const DB = path.join(os.tmpdir(), `admin-test-${Date.now()}.db`);

const srv = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, DB_PATH: DB, PORT: String(PORT), ADMIN_PASSWORD: PW },
  stdio: 'ignore'
});

const admin = { 'Content-Type': 'application/json', 'x-admin-password': PW };
const plain = { 'Content-Type': 'application/json' };

const ready = async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${URL}/components`); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server never came up');
};

const body = (key) => JSON.stringify({
  inventory_key: key, name: 'Test Part', category: 'resistor',
  package: '0805', in_stock: 5, location: 'A1', manufacturer_nr: 'MFR-1'
});

try {
  await ready();

  // --- the gate rejects everything without the right password ---
  assert.equal((await fetch(`${URL}/components`, { method: 'POST', headers: plain, body: body('k1') })).status, 401, 'add with no password must 401');
  assert.equal((await fetch(`${URL}/components`, { method: 'POST', headers: { ...plain, 'x-admin-password': 'wrong' }, body: body('k1') })).status, 401, 'add with wrong password must 401');
  assert.equal((await fetch(`${URL}/components/k1`, { method: 'DELETE' })).status, 401, 'delete with no password must 401');
  assert.equal((await fetch(`${URL}/admin/check`)).status, 401, 'check with no password must 401');

  // nothing leaked through
  assert.equal((await (await fetch(`${URL}/components`)).json()).length, 0, 'rejected writes must not reach the db');

  // --- the gate opens with the right password ---
  assert.ok((await fetch(`${URL}/admin/check`, { headers: admin })).ok, 'check with correct password must pass');
  assert.ok((await fetch(`${URL}/components`, { method: 'POST', headers: admin, body: body('k1') })).ok, 'add with correct password must succeed');
  assert.equal((await (await fetch(`${URL}/components`)).json()).length, 1, 'component should now exist');

  assert.ok((await fetch(`${URL}/components/k1`, { method: 'DELETE', headers: admin })).ok, 'delete with correct password must succeed');
  assert.equal((await (await fetch(`${URL}/components`)).json()).length, 0, 'component should be gone');

  // --- approving a suggestion moves it into the inventory ---
  await fetch(`${URL}/suggested_components`, { method: 'POST', headers: plain, body: body('s1') });
  assert.equal((await fetch(`${URL}/suggested_components/s1/approve`, { method: 'POST' })).status, 401, 'approve with no password must 401');

  assert.ok((await fetch(`${URL}/suggested_components/s1/approve`, { method: 'POST', headers: admin })).ok, 'approve must succeed');
  assert.equal((await (await fetch(`${URL}/components`)).json()).length, 1, 'approved suggestion must land in components');
  assert.equal((await (await fetch(`${URL}/suggested_components`)).json()).length, 0, 'approved suggestion must leave the queue');

  assert.equal((await fetch(`${URL}/suggested_components/s1/approve`, { method: 'POST', headers: admin })).status, 404, 'approving a gone suggestion must 404');

  // --- everyday lab actions stay open: gating them would break the app ---
  assert.ok((await fetch(`${URL}/components/s1/use`, { method: 'POST', headers: plain, body: JSON.stringify({ amount: 2, action: 'take' }) })).ok, 'take must not need a password');
  assert.ok((await fetch(`${URL}/reports`, { method: 'POST', headers: plain, body: JSON.stringify({ inventory_key: 's1', report_type: 'Low on stock' }) })).ok, 'reporting must not need a password');
  assert.ok((await fetch(`${URL}/suggested_components`, { method: 'POST', headers: plain, body: body('s2') })).ok, 'suggesting must not need a password');


  // --- numbers are validated before they can reach in_stock ---
  assert.equal((await fetch(`${URL}/components/nope/use`, { method: 'POST', headers: plain, body: JSON.stringify({ amount: 1, action: 'take' }) })).status, 404, 'use on an unknown key must 404, not crash');
  assert.equal((await fetch(`${URL}/components/s1/use`, { method: 'POST', headers: plain, body: JSON.stringify({ amount: 'abc', action: 'take' }) })).status, 400, 'a non-numeric amount must be rejected');
  assert.equal((await fetch(`${URL}/components/s1/report-real`, { method: 'POST', headers: plain, body: JSON.stringify({ reported_number: 'abc' }) })).status, 400, 'a non-numeric count must be rejected');
  assert.equal((await fetch(`${URL}/components/nope/report-real`, { method: 'POST', headers: plain, body: JSON.stringify({ reported_number: 1 }) })).status, 404, 'report-real on an unknown key must 404');

  // the payoff: none of that junk landed in the column
  const stock = (await (await fetch(`${URL}/components`)).json())[0].in_stock;
  assert.ok(Number.isInteger(stock), `in_stock must still be an integer, got ${JSON.stringify(stock)}`);

  // --- reading reports is admin-only and joins to the component name ---
  assert.equal((await fetch(`${URL}/reports`)).status, 401, 'listing reports must need a password');
  const list = await (await fetch(`${URL}/reports`, { headers: admin })).json();
  assert.equal(list.length, 1, 'the report filed above must come back');
  assert.equal(list[0].report_type, 'Low on stock', 'report type must round-trip');
  assert.equal(list[0].name, 'Test Part', 'report must carry the component name');

  // deleting a part must succeed even though reports hold a FK to it, and must take them with it
  assert.ok((await fetch(`${URL}/components/s1`, { method: 'DELETE', headers: admin })).ok, 'deleting a reported part must not fail on the FK');
  const afterDelete = await (await fetch(`${URL}/reports`, { headers: admin })).json();
  assert.equal(afterDelete.length, 0, 'deleting a part must clear its reports, not fail on the FK');

  console.log('admin gate ok');
} finally {
  const exited = new Promise((r) => srv.once('exit', r));
  srv.kill();
  await exited; // Windows keeps the sqlite handle open until the child is really gone
  fs.rmSync(DB, { force: true, maxRetries: 10, retryDelay: 100 });
}

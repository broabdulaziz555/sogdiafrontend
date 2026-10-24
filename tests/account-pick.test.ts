// Run: npx tsx tests/account-pick.test.ts
import assert from 'node:assert/strict';
import { accountStage, isTradingAccount, pickAccount, statusLabel } from '../src/components/terminal/accountStage';

const A = { id: 'a', status: 'failed' }, B = { id: 'b', status: 'active' }, C = { id: 'c', status: 'passed' };

// a breached account is selectable, even when it is the only one
assert.equal(pickAccount([A], null, null), 'a');
// ...and it can be asked for by id (?account= or last used), even when another account is active
assert.equal(pickAccount([A, B], null, 'a'), 'a');
// the account being viewed is kept when the engine fails it: the terminal does not move away
assert.equal(pickAccount([{ ...B, status: 'failed' }, C], 'b', null), 'b');
// default is the first active account, else the first of any status
assert.equal(pickAccount([A, B, C], null, null), 'b');
assert.equal(pickAccount([A, C], null, null), 'a');
// a stale current id / wanted id falls back
assert.equal(pickAccount([A, B], 'gone', 'also-gone'), 'b');
assert.equal(pickAccount([], null, null), null);

// only an active account trades
assert.equal(isTradingAccount({ status: 'active' }), true);
for (const s of ['failed', 'breached', 'passed', 'frozen', 'closed']) assert.equal(isTradingAccount({ status: s }), false, s);
assert.equal(isTradingAccount(null), false);

// Evaluation = has a profit target; Funded = everything else
assert.equal(accountStage({ profit_target_pct: 8 }), 'Evaluation');
assert.equal(accountStage({ profit_target_pct: null }), 'Funded');
assert.equal(statusLabel('failed'), 'Breached');
assert.equal(statusLabel('breached'), 'Breached');
assert.equal(statusLabel('passed'), 'Passed');

console.log('ALL PASS (account selection / stage / labels)');

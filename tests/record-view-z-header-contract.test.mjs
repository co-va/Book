import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../core/records/view.js', import.meta.url), 'utf8');

assert.match(source, /export function openRecordView/);
assert.match(source, /mountRecordZ\(\{/);
assert.match(source, /record-view-z/);
assert.match(source, /recordConfirmationMiniCard\(\{/);
assert.match(source, /setV2ZHeaderRows\(layer, \[confirmedControl, attendanceControl\]\)/);
assert.match(source, /data-record-view-confirmed/);
assert.match(source, /data-record-view-attendance/);
assert.doesNotMatch(source, /openRecordEditFlow|moveRecord/);

console.log('Record View Z contract: OK');

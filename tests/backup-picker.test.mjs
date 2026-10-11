import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
let source = await readFile(new URL('../mobile/src/utils/backup.ts', import.meta.url), 'utf8');
source = source.replace("import { File, Paths } from 'expo-file-system';", 'const File = { pickFileAsync: (...args) => globalThis.testPick(...args) };');
source = source.replace("import * as Sharing from 'expo-sharing';", '');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { pickBackup } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const backup = { version: '2.0.0', exportDate: '2026-10-11', data: { buckets: [], transactions: [], recurringTransactions: [], budgets: [], monthlySummaries: [], yearlySummaries: [] } };
test('reads the picker-returned file directly, without reconstructing a URI', async () => {
  let reads = 0;
  globalThis.testPick = async options => {
    assert.deepEqual(options, { mimeTypes: ['application/json'], multipleFiles: false });
    return { canceled: false, result: { text: async () => { reads++; return JSON.stringify(backup); } } };
  };
  assert.deepEqual(await pickBackup(), backup);
  assert.equal(reads, 1);
});
test('cancel leaves no backup to restore and never reads a file', async () => {
  globalThis.testPick = async () => ({ canceled: true, result: null });
  assert.equal(await pickBackup(), null);
});
test('file read denial fails before parsing and gives actionable feedback', async () => {
  globalThis.testPick = async () => ({ canceled: false, result: { text: async () => { throw new Error("Missing READ permission: private path"); } } });
  await assert.rejects(pickBackup(), error => /Save it to Downloads/.test(error.message) && !/private path/.test(error.message));
});
test('unreadable JSON and invalid backup schema still fail before restore confirmation', async () => {
  for (const [content, message] of [['{', /Invalid JSON/], ['{}', /unsupported backup/]]) {
    globalThis.testPick = async () => ({ canceled: false, result: { text: async () => content } });
    await assert.rejects(pickBackup(), message);
  }
});

/**
 * Integration tests for uncatchable native addon exceptions.
 *
 * These scenarios previously caused process aborts (SIGABRT) due to Napi::Error
 * C++ exceptions escaping from async Work_After* callbacks. With
 * NAPI_DISABLE_CPP_EXCEPTIONS=1, these are now catchable JS errors and the
 * child processes exit normally.
 *
 * Each test runs the dangerous operation in a child process to isolate any
 * potential crash from the test runner.
 */

'use strict';

const assert = require('assert');
const { execFile } = require('child_process');
const path = require('path');

const CHILD_TIMEOUT = 30000;

function runChild(scriptPath) {
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [scriptPath],
            { timeout: CHILD_TIMEOUT, maxBuffer: 1024 * 1024 },
            (error, stdout, stderr) => {
                resolve({
                    exitCode: error ? (error.code || 1) : 0,
                    signal: error ? (error.killed ? 'SIGKILL' : (error.signal || null)) : null,
                    stdout: stdout || '',
                    stderr: stderr || ''
                });
            }
        );
    });
}

describe('Uncatchable native addon exceptions', function() {
    this.timeout(60000);

    it('Backup.step() after Backup.finish() returns a catchable JS error', async function() {
        const script = path.join(__dirname, 'uncatchable-scenarios', 'backup-step-after-finish.js');
        const result = await runChild(script);

        // Process should exit normally (exit code 0), not crash with SIGABRT
        assert.strictEqual(result.signal, null, 'Process should not be killed by signal');
        assert.strictEqual(result.exitCode, 0, 'Process should exit with code 0');
        assert.ok(result.stdout.includes('OK: got expected error'),
            `Expected success message in stdout, got: ${result.stdout}`);
    });

    it('JS callback throw inside Work_After* async callback is a normal JS exception', async function() {
        const script = path.join(__dirname, 'uncatchable-scenarios', 'stmt-callback-throws.js');
        const result = await runChild(script);

        // Process should exit with code 1 (uncaught JS exception), not SIGABRT (code 134)
        assert.strictEqual(result.signal, null, 'Process should not be killed by signal');
        assert.strictEqual(result.exitCode, 1, 'Process should exit with code 1 (uncaught exception)');
        assert.ok(result.stderr.includes('intentional throw from async callback'),
            `Expected error message in stderr, got: ${result.stderr}`);
    });
});
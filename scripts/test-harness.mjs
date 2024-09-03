import { chunksToLinesAsync } from '@rauschma/stringio';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import process from 'node:process';

const TEST_PASS_EOF = 'SSC_TEST_PASS';
const TEST_FAIL_EOF = 'SSC_TEST_FAIL';

const label = {
    pass: chalk.bgGreen.black(' PASS '),
    fail: chalk.bgRed.white.bold(' FAIL '),
};

// DO NOT RUN THIS DIRECTLY: use pnpm test
// test-harness.mjs executes the /tests/tests.html script in socket, and forces
// app exit and success/fail status code.
async function main() {
    const ssc = spawn('ssc', ['build', '--run'], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let passed = null;

    for await (let line of chunksToLinesAsync(ssc.stdout)) {
        line = line.trimEnd();
        if (line.includes(TEST_PASS_EOF)) {
            passed = true;
            console.log(`\n\nOK`);
            break;
        } else if (line.includes(TEST_FAIL_EOF)) {
            passed = false;
            console.log(`\n\nTESTS FAILED`);
            break;
        } else {
            console.log(
                line
                    .replace(/^PASS:/, label.pass)
                    .replace(/^FAIL:/, label.fail),
            );
        }
    }

    ssc.kill();

    return passed ? 0 : 1;
}

main()
    .catch((err) => {
        console.error('process failed:', err);
        return 1;
    })
    .finally((code) => process.exit(code));

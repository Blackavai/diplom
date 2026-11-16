// Секрет не передаётся аргументом командной строки и не печатается в терминал.
module.exports = async function readPassword(prompt) {
    const input = process.stdin;
    if (!input.isTTY) throw new Error('Password input requires a terminal');
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    try {
        return await new Promise((resolve, reject) => {
            let value = '';
            function onData(chunk) {
                for (const char of chunk) {
                    if (char === '\u0003' || char === '\u0004') {
                        input.off('data', onData);
                        reject(new Error('Input cancelled'));
                        return;
                    }
                    if (char === '\r' || char === '\n') {
                        input.off('data', onData);
                        resolve(value);
                        return;
                    }
                    if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
                    else if (char >= ' ') value += char;
                }
            }
            input.on('data', onData);
        });
    } finally {
        input.setRawMode(false);
        input.pause();
        process.stdout.write('\n');
    }
};

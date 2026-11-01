'use strict';
// Usage: npm run hash-password -- "your-strong-password"
//    or: npm run hash-password   (prompts, input hidden)
const readline = require('node:readline');
const { hashPassword } = require('../server/security');

function done(pw) {
  if (!pw || pw.length < 10) {
    console.error('Пароль должен быть не короче 10 символов.');
    process.exit(1);
  }
  console.log('\nДобавьте строку в .env:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(pw)}\n`);
}

const arg = process.argv[2];
if (arg) done(arg);
else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.stdoutMuted = true;
  rl._writeToOutput = function (s) { if (!this.stdoutMuted || s.includes('Пароль')) this.output.write(s); };
  rl.question('Пароль администратора: ', (pw) => { rl.close(); done(pw); });
}

import fs from 'fs';
import cron from 'node-cron';
import { join } from 'path';

function copyLog(date = new Date()) {
  date = date.toISOString().split('T')[0];

  const logFolder = join(process.cwd(), 'logs');
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }

  const logPath = join(process.cwd(), 'logs/current.log');
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
  }

  const logDatePath = join(process.cwd(), 'logs', `${date}.log`);
  if (!fs.existsSync(logDatePath)) {
    fs.writeFileSync(logDatePath, '');
  }

  // copy data from current.log to date.log and clear current.log
  const logData = fs.readFileSync(logPath, 'utf8');
  fs.appendFileSync(logDatePath, logData);
  fs.writeFileSync(logPath, '');
}

copyLog();

cron.schedule('0 0 * * *', () => {
  // date - 1 day
  const date = new Date();
  date.setDate(date.getDate() - 1);
  copyLog(date);
});

require('dotenv').config();
const { sendDailyEmails } = require('./cron-jobs');

console.log('Bắt đầu test gửi email...');
sendDailyEmails()
  .then(() => {
    console.log('Test thành công!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test thất bại:', error);
    process.exit(1);
  }); 
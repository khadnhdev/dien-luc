require('dotenv').config();
const { sendDailyEmails } = require('./cron-jobs');

console.log('=== Chạy job gửi email tổng hợp ===');
console.log(`Thời gian: ${new Date().toLocaleString('vi-VN')}`);

sendDailyEmails()
  .then(() => {
    console.log('\n✓ Job gửi email đã chạy xong!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Lỗi khi chạy job:', error);
    process.exit(1);
  }); 
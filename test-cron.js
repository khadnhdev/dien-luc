require('dotenv').config();

const { runCrawler } = require('./cron-jobs');

// Kiểm tra cờ ENABLE_CRAWLER
if (process.env.ENABLE_CRAWLER !== 'true') {
  console.log('Crawler đã bị tắt (ENABLE_CRAWLER=false)');
  process.exit(0);
}

console.log('Bắt đầu test job cào dữ liệu...');
runCrawler()
  .then(() => {
    console.log('Test thành công!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test thất bại:', error);
    process.exit(1);
  }); 
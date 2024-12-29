const { runCrawler } = require('./cron-jobs');

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
const cron = require('node-cron');
const { main } = require('./outages-crawler');

// Hàm chạy crawler với logging
async function runCrawler() {
  const startTime = new Date();
  console.log('\n=== Bắt đầu job cào lịch cúp điện định kỳ ===');
  console.log(`Thời gian bắt đầu: ${startTime.toLocaleString('vi-VN')}`);
  
  try {
    await main();
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    console.log('=== Kết thúc job cào lịch cúp điện ===');
    console.log(`Thời gian kết thúc: ${endTime.toLocaleString('vi-VN')}`);
    console.log(`Tổng thời gian chạy: ${Math.floor(duration / 60)} phút ${Math.floor(duration % 60)} giây\n`);
  } catch (error) {
    console.error('❌ Lỗi khi chạy job cào lịch cúp điện:', error);
  }
}

// Khởi tạo các jobs
function initializeCronJobs() {
  // Chạy mỗi 2 tiếng
  const job = cron.schedule('0 */2 * * *', runCrawler, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh" // Đặt múi giờ Việt Nam
  });

  console.log('Đã khởi tạo job cào lịch cúp điện:');
  console.log('- Chạy mỗi 2 tiếng');
  console.log('- Múi giờ: Asia/Ho_Chi_Minh');
  
  // Chạy ngay lập tức một lần
  console.log('Chạy job lần đầu...');
  runCrawler().catch(console.error);

  return job;
}

module.exports = {
  initializeCronJobs,
  runCrawler // Export để có thể test
}; 
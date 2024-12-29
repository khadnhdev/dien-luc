const cron = require('node-cron');
const { main } = require('./outages-crawler');
const { db } = require('./database');
const emailService = require('./email-service');

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

// Hàm gửi email tổng hợp hàng ngày
async function sendDailyEmails() {
  const startTime = new Date();
  console.log('\n=== Bắt đầu gửi email tổng hợp hàng ngày ===');
  console.log(`Thời gian bắt đầu: ${startTime.toLocaleString('vi-VN')}`);

  try {
    // Lấy danh sách người dùng có đăng ký theo dõi
    const users = await new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT u.*, GROUP_CONCAT(us.ma_cong_ty_con) as subscribed_companies 
        FROM users u
        JOIN user_subscriptions us ON u.id = us.user_id
        GROUP BY u.id
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`Tìm thấy ${users.length} người dùng có đăng ký theo dõi`);

    let emailsSent = 0;
    for (const user of users) {
      try {
        const companies = user.subscribed_companies.split(',');
        
        // Lấy lịch cúp điện 3 ngày
        const schedules = await new Promise((resolve, reject) => {
          db.all(
            `SELECT * FROM lich_cup_dien 
             WHERE ma_cong_ty_con IN (${companies.map(() => '?').join(',')})
             AND date(thoi_gian_bat_dau) >= date('now')
             AND date(thoi_gian_bat_dau) <= date('now', '+2 days')
             ORDER BY thoi_gian_bat_dau ASC`,
            companies,
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        if (schedules.length > 0) {
          await emailService.sendScheduleSummaryEmail(user.email, schedules);
          emailsSent++;
          console.log(`✓ Đã gửi email cho ${user.email} (${schedules.length} lịch)`);
        } else {
          console.log(`- Bỏ qua ${user.email} (không có lịch cúp điện)`);
        }

      } catch (error) {
        console.error(`❌ Lỗi khi gửi email cho ${user.email}:`, error);
      }
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;

    console.log('=== Kết thúc gửi email tổng hợp ===');
    console.log(`Đã gửi: ${emailsSent}/${users.length} email`);
    console.log(`Thời gian kết thúc: ${endTime.toLocaleString('vi-VN')}`);
    console.log(`Tổng thời gian: ${Math.floor(duration / 60)} phút ${Math.floor(duration % 60)} giây\n`);

  } catch (error) {
    console.error('❌ Lỗi khi gửi email tổng hợp:', error);
  }
}

// Khởi tạo các jobs
function initializeCronJobs() {
  // Kiểm tra cờ ENABLE_CRAWLER từ env
  const enableCrawler = process.env.ENABLE_CRAWLER === 'true';
  
  if (!enableCrawler) {
    console.log('Crawler đã bị tắt (ENABLE_CRAWLER=false)');
    return null;
  }

  // Job cào dữ liệu mỗi 2 tiếng
  const crawlerJob = cron.schedule('0 */2 * * *', runCrawler, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
  });

  // Job gửi email lúc 7 giờ sáng mỗi ngày
  const emailJob = cron.schedule('0 7 * * *', sendDailyEmails, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
  });

  console.log('Đã khởi tạo các jobs:');
  console.log('1. Cào lịch cúp điện:');
  console.log('   - Chạy mỗi 2 tiếng');
  console.log('   - Múi giờ: Asia/Ho_Chi_Minh');
  console.log('2. Gửi email tổng hợp:');
  console.log('   - Chạy lúc 7:00 sáng mỗi ngày');
  console.log('   - Múi giờ: Asia/Ho_Chi_Minh');
  
  // Chạy crawler ngay lập tức một lần
  console.log('Chạy crawler lần đầu...');
  runCrawler().catch(console.error);

  return {
    crawlerJob,
    emailJob
  };
}

module.exports = {
  initializeCronJobs,
  runCrawler,
  sendDailyEmails // Export để có thể test
}; 
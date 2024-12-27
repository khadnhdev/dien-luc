require('dotenv').config();
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { db } = require('./database');

// Cấu hình email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Helper function để gửi email
async function sendEmail(to, subject, html) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: to,
    subject: subject,
    html: html
  });
}

// Chạy lúc 7h sáng mỗi ngày
cron.schedule('0 7 * * *', async () => {
  try {
    // Lấy danh sách người dùng và đăng ký
    const users = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.*, GROUP_CONCAT(us.ma_cong_ty_con) as subscribed_companies
        FROM users u
        JOIN user_subscriptions us ON u.id = us.user_id
        GROUP BY u.id
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const user of users) {
      const companies = user.subscribed_companies.split(',');
      
      // Lấy lịch cúp điện mới trong 24h qua
      const outages = await new Promise((resolve, reject) => {
        db.all(`
          SELECT * FROM lich_cup_dien
          WHERE ma_cong_ty_con IN (${companies.map(() => '?').join(',')})
          AND created_at >= datetime('now', '-1 day')
          ORDER BY thoi_gian_bat_dau
        `, companies, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      if (outages.length > 0) {
        // Gửi email
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: user.email,
          subject: 'Thông báo lịch cúp điện mới',
          html: generateEmailTemplate(outages)
        });
      }
    }
  } catch (error) {
    console.error('Lỗi khi gửi email:', error);
  }
});

function generateEmailTemplate(outages) {
  return `
    <h2>Thông báo lịch cúp điện mới</h2>
    <p>Các lịch cúp điện mới được cập nhật:</p>
    <ul>
      ${outages.map(o => `
        <li>
          <strong>${o.ten_cong_ty_con}</strong><br>
          Thời gian: ${new Date(o.thoi_gian_bat_dau).toLocaleString('vi-VN')} - 
                    ${new Date(o.thoi_gian_ket_thuc).toLocaleString('vi-VN')}<br>
          Khu vực: ${o.khu_vuc}<br>
          Lý do: ${o.ly_do}
        </li>
      `).join('')}
    </ul>
  `;
}

async function sendScheduleSummaryEmail(email, schedules) {
  // Phân loại lịch theo ngày
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  
  const todaySchedules = schedules.filter(s => new Date(s.thoi_gian_bat_dau).toDateString() === today.toDateString());
  const tomorrowSchedules = schedules.filter(s => new Date(s.thoi_gian_bat_dau).toDateString() === tomorrow.toDateString());
  const dayAfterSchedules = schedules.filter(s => new Date(s.thoi_gian_bat_dau).toDateString() === dayAfter.toDateString());
  
  // Tạo subject
  let subject = 'Lịch Cúp Điện 3 Ngày Tới';
  if (todaySchedules.length > 0) {
    subject = `⚡ CẢNH BÁO: Có ${todaySchedules.length} lịch cúp điện trong hôm nay`;
  }
  
  // Tạo HTML template
  const template = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a73e8; margin: 0; font-size: 24px;">Lịch Cúp Điện</h1>
          <p style="color: #666; margin: 10px 0 0;">Cập nhật ngày ${today.toLocaleDateString('vi-VN')}</p>
        </div>
        
        <div style="background: ${todaySchedules.length > 0 ? '#fff3cd' : '#e8f5e9'}; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: ${todaySchedules.length > 0 ? '#dc3545' : '#1b5e20'}; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">${todaySchedules.length > 0 ? '⚠️' : '✅'}</span>
            <span>Hôm nay (${today.toLocaleDateString('vi-VN')})</span>
          </h3>
          ${todaySchedules.length > 0 ? `
            <div style="background: #dc3545; color: white; padding: 8px 12px; border-radius: 4px; margin-bottom: 15px;">
              ⚡ Có ${todaySchedules.length} lịch cúp điện được lên kế hoạch
            </div>
            ${formatScheduleList(todaySchedules)}
          ` : '<p style="color: #1b5e20;">✅ Không có lịch cúp điện</p>'}
        </div>
        
        <div style="background: white; border: 1px solid #dee2e6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #495057;">
            ${tomorrow.toLocaleDateString('vi-VN')}
            ${tomorrowSchedules.length > 0 ? `<span style="color: #dc3545; font-size: 14px; margin-left: 8px;">
              (${tomorrowSchedules.length} lịch cúp điện)
            </span>` : ''}
          </h3>
          ${tomorrowSchedules.length > 0 ? formatScheduleList(tomorrowSchedules) : 
            '<p>Không có lịch cúp điện</p>'}
        </div>
        
        <div style="background: white; border: 1px solid #dee2e6; padding: 15px; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #495057;">
            ${dayAfter.toLocaleDateString('vi-VN')}
            ${dayAfterSchedules.length > 0 ? `<span style="color: #dc3545; font-size: 14px; margin-left: 8px;">
              (${dayAfterSchedules.length} lịch cúp điện)
            </span>` : ''}
          </h3>
          ${dayAfterSchedules.length > 0 ? formatScheduleList(dayAfterSchedules) : 
            '<p>Không có lịch cúp điện</p>'}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #666;">
          <div style="margin-bottom: 20px;">
            <a href="${process.env.APP_URL}" 
               style="background: #1a73e8; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; display: inline-block;">
               Xem chi tiết trên ứng dụng
            </a>
          </div>
          <p style="margin: 0;">Email này được gửi tự động từ hệ thống theo dõi lịch cúp điện</p>
          <p style="margin: 5px 0 0;">© ${new Date().getFullYear()} Lịch Cúp Điện. All rights reserved.</p>
          <p style="margin: 5px 0 0; font-size: 12px;">
            Nếu bạn không muốn nhận email này, vui lòng 
            <a href="${process.env.APP_URL}/subscriptions" style="color: #1a73e8; text-decoration: none;">
              hủy đăng ký theo dõi
            </a>
          </p>
        </div>
      </div>
    </div>
  `;
  
  await sendEmail(email, subject, template);
}

function formatScheduleList(schedules) {
  return `
    <ul style="list-style: none; padding: 0; margin: 0;">
      ${schedules.map(schedule => `
        <li style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #dee2e6;">
          <div style="font-weight: bold;">${schedule.ten_cong_ty_con}</div>
          <div>⏰ ${new Date(schedule.thoi_gian_bat_dau).toLocaleString('vi-VN')} - 
                ${new Date(schedule.thoi_gian_ket_thuc).toLocaleString('vi-VN')}</div>
          <div>📍 ${schedule.khu_vuc}</div>
          ${schedule.ly_do ? `<div>ℹ️ ${schedule.ly_do}</div>` : ''}
        </li>
      `).join('')}
    </ul>
  `;
}

// Export các functions
module.exports = {
  sendScheduleSummaryEmail,
  sendEmail
}; 
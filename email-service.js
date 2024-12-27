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
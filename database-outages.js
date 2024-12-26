const { db } = require('./database');

function initializeOutagesDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Xóa bảng cũ nếu tồn tại
      db.run(`DROP TABLE IF EXISTS lich_cup_dien`, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Tạo bảng lịch cúp điện
        db.run(`CREATE TABLE IF NOT EXISTS lich_cup_dien (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ma_dien_luc TEXT,
          ten_dien_luc TEXT,
          ma_tram TEXT,
          ten_tram TEXT,
          thoi_gian_bat_dau DATETIME,
          thoi_gian_ket_thuc DATETIME,
          khu_vuc TEXT,
          ly_do TEXT,
          trang_thai TEXT,
          loai_cat_dien TEXT,
          zone TEXT NOT NULL
        )`, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Tạo bảng lưu thông tin cập nhật
          db.run(`CREATE TABLE IF NOT EXISTS cap_nhat_lich_cup_dien (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thoi_gian_bat_dau DATETIME,
            thoi_gian_ket_thuc DATETIME,
            tong_thoi_gian INTEGER,
            so_lich_cup_dien INTEGER
          )`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
  });
}

async function checkDuplicate(data) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count 
      FROM lich_cup_dien 
      WHERE ma_dien_luc = ? 
      AND thoi_gian_bat_dau = ? 
      AND thoi_gian_ket_thuc = ?
      AND khu_vuc = ?
      AND ly_do = ?
    `, [
      data.org_code || data.ma_dien_luc,
      data.thoi_gian_bat_dau,
      data.thoi_gian_ket_thuc,
      data.khu_vuc,
      data.ly_do
    ], (err, row) => {
      if (err) reject(err);
      else resolve(row.count > 0);
    });
  });
}

function saveLichCupDien(data) {
  return new Promise(async (resolve, reject) => {
    try {
      // Kiểm tra trùng lặp trước khi lưu
      const isDuplicate = await checkDuplicate(data);
      if (isDuplicate) {
        console.log('Dữ liệu trùng lặp:', {
          ma_dien_luc: data.org_code || data.ma_dien_luc,
          ten_dien_luc: data.org_name || data.ten_dien_luc,
          thoi_gian: `${data.thoi_gian_bat_dau} -> ${data.thoi_gian_ket_thuc}`,
          khu_vuc: data.khu_vuc,
          ly_do: data.ly_do
        });
        resolve();
        return;
      }

      const stmt = db.prepare(`
        INSERT INTO lich_cup_dien (
          ma_dien_luc, ten_dien_luc, ma_tram, ten_tram,
          thoi_gian_bat_dau, thoi_gian_ket_thuc,
          khu_vuc, ly_do, trang_thai, loai_cat_dien, zone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        data.org_code || data.ma_dien_luc,
        data.org_name || data.ten_dien_luc,
        data.ma_tram,
        data.ten_tram,
        data.thoi_gian_bat_dau,
        data.thoi_gian_ket_thuc,
        data.khu_vuc,
        data.ly_do,
        data.trang_thai,
        data.loai_cat_dien,
        data.zone,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
      stmt.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

// Thêm hàm lưu thông tin cập nhật
function saveCapNhat(data) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO cap_nhat_lich_cup_dien (
        thoi_gian_bat_dau,
        thoi_gian_ket_thuc,
        tong_thoi_gian,
        so_lich_cup_dien
      ) VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      data.thoi_gian_bat_dau,
      data.thoi_gian_ket_thuc,
      data.tong_thoi_gian,
      data.so_lich_cup_dien,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
    stmt.finalize();
  });
}

module.exports = {
  initializeOutagesDatabase,
  saveLichCupDien,
  saveCapNhat
}; 
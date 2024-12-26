const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'evn.db');
const db = new sqlite3.Database(dbPath);

function initializeOutagesDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tạo bảng lịch cúp điện
      db.run(`CREATE TABLE IF NOT EXISTS lich_cup_dien (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ma_dien_luc TEXT,
        ten_dien_luc TEXT,
        ma_cong_ty_con TEXT,
        ten_cong_ty_con TEXT,
        ma_tram TEXT,
        ten_tram TEXT,
        thoi_gian_bat_dau TEXT,
        thoi_gian_ket_thuc TEXT,
        khu_vuc TEXT,
        ly_do TEXT,
        trang_thai TEXT,
        loai_cat_dien TEXT,
        zone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(
          ma_dien_luc,
          ma_cong_ty_con,
          ma_tram,
          ten_tram,
          thoi_gian_bat_dau,
          thoi_gian_ket_thuc,
          khu_vuc,
          ly_do,
          trang_thai,
          loai_cat_dien,
          zone
        )
      )`, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Tạo bảng thông tin cập nhật
        db.run(`CREATE TABLE IF NOT EXISTS cap_nhat (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thoi_gian_bat_dau TEXT,
          thoi_gian_ket_thuc TEXT,
          tong_thoi_gian REAL,
          so_lich_cup_dien INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });
}

function saveLichCupDien(data) {
  return new Promise((resolve, reject) => {
    // Kiểm tra trùng lặp trước
    db.get(`
      SELECT COUNT(*) as count 
      FROM lich_cup_dien 
      WHERE ma_dien_luc = ?
      AND ma_cong_ty_con = ?
      AND ma_tram = ?
      AND ten_tram = ?
      AND thoi_gian_bat_dau = ?
      AND thoi_gian_ket_thuc = ?
      AND khu_vuc = ?
      AND ly_do = ?
      AND trang_thai = ?
      AND loai_cat_dien = ?
      AND zone = ?
    `, [
      data.ma_dien_luc,
      data.ma_cong_ty_con,
      data.ma_tram || '',
      data.ten_tram || '',
      data.thoi_gian_bat_dau,
      data.thoi_gian_ket_thuc,
      data.khu_vuc,
      data.ly_do,
      data.trang_thai || '',
      data.loai_cat_dien || '',
      data.zone
    ], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      const isDuplicate = row.count > 0;
      
      // Nếu trùng lặp, resolve với thông tin
      if (isDuplicate) {
        resolve({ isDuplicate: true, isNew: false });
        return;
      }

      // Nếu không trùng, thêm mới
      const stmt = db.prepare(`
        INSERT INTO lich_cup_dien (
          ma_dien_luc,
          ten_dien_luc,
          ma_cong_ty_con,
          ten_cong_ty_con,
          ma_tram,
          ten_tram,
          thoi_gian_bat_dau,
          thoi_gian_ket_thuc,
          khu_vuc,
          ly_do,
          trang_thai,
          loai_cat_dien,
          zone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        data.ma_dien_luc,
        data.ten_dien_luc,
        data.ma_cong_ty_con,
        data.ten_cong_ty_con,
        data.ma_tram || '',
        data.ten_tram || '',
        data.thoi_gian_bat_dau,
        data.thoi_gian_ket_thuc,
        data.khu_vuc,
        data.ly_do,
        data.trang_thai || '',
        data.loai_cat_dien || '',
        data.zone,
        (err) => {
          stmt.finalize();
          if (err) {
            reject(err);
          } else {
            resolve({ isDuplicate: false, isNew: true });
          }
        }
      );
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

// Thêm hàm lưu thông tin cập nhật
function saveCapNhat(data) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO cap_nhat (
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
  saveCapNhat,
  db
}; 
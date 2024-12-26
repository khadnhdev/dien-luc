const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'evn.db');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tạo bảng công ty chính với thêm cột zone
      db.run(`CREATE TABLE IF NOT EXISTS cong_ty_dien_luc (
        id_cong_ty TEXT PRIMARY KEY,
        ten_cong_ty TEXT NOT NULL,
        zone TEXT NOT NULL
      )`);

      // Tạo bảng công ty con với thêm cột zone
      db.run(`CREATE TABLE IF NOT EXISTS cong_ty_con (
        ma_cong_ty_con TEXT PRIMARY KEY,
        ten_cong_ty_con TEXT NOT NULL,
        id_cong_ty_cha TEXT,
        zone TEXT NOT NULL,
        FOREIGN KEY (id_cong_ty_cha) REFERENCES cong_ty_dien_luc(id_cong_ty)
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function saveCongTyDienLuc(congTy) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO cong_ty_dien_luc (id_cong_ty, ten_cong_ty, zone) VALUES (?, ?, ?)'
    );
    stmt.run(congTy.id_cong_ty, congTy.ten_cong_ty, congTy.zone || 'mien_nam', (err) => {
      if (err) reject(err);
      else resolve();
    });
    stmt.finalize();
  });
}

function saveCongTyCon(congTyCon, idCongTyCha) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO cong_ty_con (ma_cong_ty_con, ten_cong_ty_con, id_cong_ty_cha, zone) VALUES (?, ?, ?, ?)'
    );
    stmt.run(
      congTyCon.ma_cong_ty_con, 
      congTyCon.ten_cong_ty_con, 
      idCongTyCha,
      'mien_nam',
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
    stmt.finalize();
  });
}

// Thêm hàm migration để update database hiện tại
function addZoneColumn() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Thêm cột zone vào bảng cong_ty_dien_luc nếu chưa tồn tại
      db.run(`
        ALTER TABLE cong_ty_dien_luc 
        ADD COLUMN zone TEXT DEFAULT 'mien_nam'
      `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          reject(err);
        }
      });

      // Thêm cột zone vào bảng cong_ty_con nếu chưa tồn tại
      db.run(`
        ALTER TABLE cong_ty_con 
        ADD COLUMN zone TEXT DEFAULT 'mien_nam'
      `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

module.exports = {
  initializeDatabase,
  saveCongTyDienLuc,
  saveCongTyCon,
  addZoneColumn,
  db
}; 
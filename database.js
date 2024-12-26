const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'evn.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Lỗi khi mở database:', err);
  } else {
    console.log('✓ Đã kết nối database thành công');
  }
});

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Xóa bảng cũ nếu tồn tại
      db.run(``, (err) => {
        // if (err) {
        //   //reject(err);
        //   //return;
        // }
        
        // Tạo bảng công ty điện lực
        db.run(`CREATE TABLE IF NOT EXISTS cong_ty_dien_luc (
          id_cong_ty TEXT PRIMARY KEY,
          ten_cong_ty TEXT,
          zone TEXT NOT NULL
        )`, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Tạo bảng công ty con
          db.run(`CREATE TABLE IF NOT EXISTS cong_ty_con (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_cong_ty_cha TEXT,
            ma_cong_ty_con TEXT,
            ten_cong_ty_con TEXT,
            zone TEXT NOT NULL,
            FOREIGN KEY (id_cong_ty_cha) REFERENCES cong_ty_dien_luc(id_cong_ty)
          )`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
  });
}

function saveCongTyDienLuc(congTy) {
  return new Promise((resolve, reject) => {
    console.log('Đang lưu công ty:', congTy);
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO cong_ty_dien_luc (id_cong_ty, ten_cong_ty, zone) VALUES (?, ?, ?)'
    );
    stmt.run(congTy.id_cong_ty, congTy.ten_cong_ty, congTy.zone, (err) => {
      if (err) {
        console.error('Lỗi khi lưu công ty:', err);
        reject(err);
      } else {
        resolve();
      }
    });
    stmt.finalize();
  });
}

function saveCongTyCon(congTyCon, idCongTyCha) {
  return new Promise((resolve, reject) => {
    console.log('Đang lưu công ty con:', congTyCon);
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO cong_ty_con (ma_cong_ty_con, ten_cong_ty_con, id_cong_ty_cha, zone) VALUES (?, ?, ?, ?)'
    );

    // Đảm bảo có zone, nếu không có thì lấy từ tham số hoặc default
    const zone = congTyCon.zone || 'mien_nam';

    stmt.run(
      congTyCon.ma_cong_ty_con, 
      congTyCon.ten_cong_ty_con, 
      idCongTyCha,
      zone,  // Sử dụng zone đã kiểm tra
      (err) => {
        if (err) {
          console.error('Lỗi khi lưu công ty con:', err);
          reject(err);
        } else {
          resolve();
        }
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
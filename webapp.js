const express = require('express');
const bodyParser = require('body-parser');
const { db } = require('./database');
const path = require('path');

const app = express();
const port = 3000;

// Cấu hình middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', async (req, res) => {
  const { zone } = req.query;
  let query = `
    SELECT 
      c.id_cong_ty,
      c.ten_cong_ty,
      c.zone,
      COUNT(cc.ma_cong_ty_con) as so_cong_ty_con
    FROM cong_ty_dien_luc c
    LEFT JOIN cong_ty_con cc ON c.id_cong_ty = cc.id_cong_ty_cha
  `;
  
  if (zone) {
    query += ` WHERE c.zone = '${zone}'`;
  }
  
  query += ` GROUP BY c.id_cong_ty`;

  db.all(query, [], (err, congty) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi database');
    }
    res.render('index', { congty, currentZone: zone });
  });
});

app.get('/congty/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM cong_ty_dien_luc WHERE id_cong_ty = ?', [id], (err, congty) => {
    if (err) {
      return res.status(500).send('Lỗi database');
    }
    if (!congty) {
      return res.status(404).send('Không tìm thấy công ty');
    }
    
    db.all('SELECT * FROM cong_ty_con WHERE id_cong_ty_cha = ?', [id], (err, congtycon) => {
      if (err) {
        return res.status(500).send('Lỗi database');
      }
      res.render('detail', { congty, congtycon });
    });
  });
});

// API để xóa công ty
app.post('/delete/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM cong_ty_con WHERE id_cong_ty_cha = ?', [id], (err) => {
    if (err) {
      return res.status(500).send('Lỗi khi xóa công ty con');
    }
    db.run('DELETE FROM cong_ty_dien_luc WHERE id_cong_ty = ?', [id], (err) => {
      if (err) {
        return res.status(500).send('Lỗi khi xóa công ty');
      }
      res.redirect('/');
    });
  });
});

// API để cập nhật công ty
app.post('/update/:id', (req, res) => {
  const { id } = req.params;
  const { ten_cong_ty, zone } = req.body;
  
  db.run(
    'UPDATE cong_ty_dien_luc SET ten_cong_ty = ?, zone = ? WHERE id_cong_ty = ?',
    [ten_cong_ty, zone, id],
    (err) => {
      if (err) {
        return res.status(500).send('Lỗi khi cập nhật công ty');
      }
      res.redirect(`/congty/${id}`);
    }
  );
});

app.get('/lich-cup-dien', async (req, res) => {
  const { zone, date, org_code, sub_org_code } = req.query;

  try {
    // Kiểm tra xem bảng có tồn tại không
    const tableExists = await new Promise((resolve) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='lich_cup_dien'",
        [],
        (err, row) => {
          if (err || !row) resolve(false);
          else resolve(true);
        }
      );
    });

    if (!tableExists) {
      return res.render('lich-cup-dien', {
        lichCupDien: [],
        orgs: [],
        subOrgs: [],
        currentZone: zone,
        currentDate: date,
        currentOrg: org_code,
        currentSubOrg: sub_org_code
      });
    }

    // Nếu bảng tồn tại, thực hiện các truy vấn
    let query = `
      SELECT * FROM lich_cup_dien
      WHERE 1=1
    `;
    
    if (zone) {
      query += ` AND zone = '${zone}'`;
    }
    
    if (date) {
      query += ` AND date(thoi_gian_bat_dau) = date('${date}')`;
    }

    if (org_code) {
      query += ` AND org_code = '${org_code}'`;
    }

    if (sub_org_code) {
      query += ` AND sub_org_code = '${sub_org_code}'`;
    }
    
    query += ` ORDER BY thoi_gian_bat_dau DESC`;

    // Thực hiện các truy vấn song song
    const [lichCupDien, orgs, subOrgs] = await Promise.all([
      new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all(`
          SELECT DISTINCT ma_dien_luc, ten_dien_luc, zone
          FROM lich_cup_dien
          ORDER BY zone, ten_dien_luc
        `, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all(`
          SELECT DISTINCT ma_dien_luc, ten_dien_luc, zone
          FROM lich_cup_dien
          ORDER BY ten_dien_luc
        `, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      })
    ]);

    // Lấy thông tin cập nhật gần nhất
    const lastUpdate = await new Promise((resolve, reject) => {
      db.get(`
        SELECT * FROM cap_nhat_lich_cup_dien 
        ORDER BY id DESC LIMIT 1
      `, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.render('lich-cup-dien', {
      lichCupDien,
      orgs,
      subOrgs,
      currentZone: zone,
      currentDate: date,
      currentOrg: org_code,
      currentSubOrg: sub_org_code,
      lastUpdate
    });

  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).send('Lỗi server');
  }
});

// API để xóa toàn bộ lịch cúp điện
app.post('/lich-cup-dien/delete-all', (req, res) => {
  db.run('DELETE FROM lich_cup_dien', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi khi xóa dữ liệu');
    }
    res.redirect('/lich-cup-dien');
  });
});

app.listen(port, () => {
  console.log(`Webapp đang chạy tại http://localhost:${port}`);
}); 
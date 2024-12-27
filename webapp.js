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
  const { zone, date, ma_dien_luc, ma_cong_ty_con, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // Hàm helper để tạo URL phân trang
  const getPageUrl = (pageNum) => {
    const url = new URL(`${req.protocol}://${req.get('host')}${req.path}`);
    const searchParams = new URLSearchParams(req.query);
    searchParams.set('page', pageNum);
    url.search = searchParams.toString();
    return url.toString();
  };

  try {
    let query = `
      SELECT * FROM lich_cup_dien
      WHERE 1=1
    `;
    let countQuery = `
      SELECT COUNT(*) as total FROM lich_cup_dien 
      WHERE 1=1
    `;
    const params = [];
    const countParams = [];

    if (zone) {
      const whereClause = ` AND zone = ?`;
      query += whereClause;
      countQuery += whereClause;
      params.push(zone);
      countParams.push(zone);
    }
    
    if (date) {
      const whereClause = ` AND date(thoi_gian_bat_dau) = date(?)`;
      query += whereClause;
      countQuery += whereClause;
      params.push(date);
      countParams.push(date);
    }

    if (ma_dien_luc) {
      const whereClause = ` AND ma_dien_luc = ?`;
      query += whereClause;
      countQuery += whereClause;
      params.push(ma_dien_luc);
      countParams.push(ma_dien_luc);
    }

    if (ma_cong_ty_con) {
      const whereClause = ` AND ma_cong_ty_con = ?`;
      query += whereClause;
      countQuery += whereClause;
      params.push(ma_cong_ty_con);
      countParams.push(ma_cong_ty_con);
    }
    
    query += ` ORDER BY thoi_gian_bat_dau DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Thực hiện các truy vấn song song
    const [lichCupDien, totalCount, congTyList, congTyConList, capNhatGanNhat] = await Promise.all([
      // Lấy danh sách lịch cúp điện có phân trang
      new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),

      // Lấy tổng số bản ghi
      new Promise((resolve, reject) => {
        db.get(countQuery, countParams, (err, row) => {
          if (err) reject(err);
          else resolve(row.total);
        });
      }),
      
      // Lấy danh sách công ty điện lực theo miền
      new Promise((resolve, reject) => {
        const congTyQuery = zone 
          ? `SELECT DISTINCT ma_dien_luc, ten_dien_luc, zone
             FROM lich_cup_dien 
             WHERE zone = ?
             ORDER BY ten_dien_luc`
          : `SELECT DISTINCT ma_dien_luc, ten_dien_luc, zone
             FROM lich_cup_dien 
             ORDER BY zone, ten_dien_luc`;
        
        db.all(congTyQuery, zone ? [zone] : [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),

      // Lấy danh sách công ty con theo công ty cha
      new Promise((resolve, reject) => {
        const congTyConQuery = ma_dien_luc 
          ? `SELECT DISTINCT ma_cong_ty_con, ten_cong_ty_con 
             FROM lich_cup_dien 
             WHERE ma_dien_luc = ?
             ORDER BY ten_cong_ty_con`
          : `SELECT DISTINCT ma_cong_ty_con, ten_cong_ty_con 
             FROM lich_cup_dien 
             WHERE ma_dien_luc IS NOT NULL
             ORDER BY ten_cong_ty_con`;
        
        db.all(congTyConQuery, ma_dien_luc ? [ma_dien_luc] : [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),

      // Lấy thông tin cập nhật gần nhất
      new Promise((resolve, reject) => {
        db.get(`
          SELECT * FROM cap_nhat 
          ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.render('lich-cup-dien', {
      lichCupDien,
      congTyList,
      congTyConList,
      currentZone: zone,
      currentDate: date,
      currentMaDienLuc: ma_dien_luc,
      currentMaCongTyCon: ma_cong_ty_con,
      capNhatGanNhat,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: totalCount,
        totalPages
      },
      getPageUrl
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
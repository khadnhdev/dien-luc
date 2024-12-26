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

app.listen(port, () => {
  console.log(`Webapp đang chạy tại http://localhost:${port}`);
}); 
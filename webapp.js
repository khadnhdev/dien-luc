require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { db } = require('./database');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { initializeOutagesDatabase } = require('./database-outages');

const app = express();
const port = process.env.PORT || 3000;

// Khởi tạo database
initializeOutagesDatabase().catch(console.error);

// Cấu hình middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cấu hình session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Cấu hình Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      // Lưu hoặc cập nhật user
      const user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!user) {
        // Tạo user mới
        const result = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)',
            [profile.id, profile.emails[0].value, profile.displayName, profile.photos[0].value],
            function(err) {
              if (err) reject(err);
              else {
                // Lấy user vừa tạo
                db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                  if (err) reject(err);
                  else resolve(newUser);
                });
              }
            }
          );
        });
        return cb(null, result);
      }
      return cb(null, user);
    } catch (error) {
      return cb(error);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, false);
    done(err, user);
  });
});

// Routes xác thực
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/subscriptions');
  }
);

// Route quản lý đăng ký theo dõi
app.get('/subscriptions', ensureAuthenticated, async (req, res) => {
  const { zone, company } = req.query;
  
  try {
    const [subscriptions, allCompanies] = await Promise.all([
      // Lấy danh sách đăng ký của user
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM user_subscriptions WHERE user_id = ?', 
          [req.user.id], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
      }),
      // Lấy danh sách tất cả công ty con với thông tin công ty cha
      new Promise((resolve, reject) => {
        db.all(`
          SELECT DISTINCT 
            c.id_cong_ty as ma_dien_luc,
            c.ten_cong_ty as ten_dien_luc, 
            c.zone,
            cc.ma_cong_ty_con,
            cc.ten_cong_ty_con
          FROM cong_ty_con cc
          JOIN cong_ty_dien_luc c ON cc.id_cong_ty_cha = c.id_cong_ty
          GROUP BY c.id_cong_ty, cc.ma_cong_ty_con
          ORDER BY c.zone, c.ten_cong_ty
        `, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      })
    ]);

    res.render('subscriptions', { 
      user: req.user,
      path: '/subscriptions',
      subscriptions,
      allCompanies,
      maxSubscriptions: 5,
      selectedZone: zone,
      selectedCompany: company
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).send('Lỗi server');
  }
});

// Route để thêm đăng ký theo dõi
app.post('/subscriptions', ensureAuthenticated, async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ success: false, error: 'Request body is empty' });
  }
  const { zone, ma_dien_luc, ma_cong_ty_con } = req.body;
  console.log(req.body);
  const user_id = req.user.id;
  try {
    // Kiểm tra xem đã đăng ký công ty điện lực này chưa
    const existingSubscription = await new Promise((resolve, reject) => {
      db.get(
        `SELECT us.*, c.id_cong_ty as ma_dien_luc
         FROM user_subscriptions us
         JOIN cong_ty_con cc ON us.ma_cong_ty_con = cc.ma_cong_ty_con
         JOIN cong_ty_dien_luc c ON cc.id_cong_ty_cha = c.id_cong_ty
         WHERE us.user_id = ? AND c.id_cong_ty = ?`,
         [user_id, ma_dien_luc],
         (err, row) => {
           if (err) reject(err);
           else resolve(row);
         }
      );
    });

    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        error: 'Bạn đã đăng ký theo dõi một điện lực thuộc công ty điện lực này'
      });
    }

    // Kiểm tra số lượng đăng ký
    const subscriptionCount = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM user_subscriptions WHERE user_id = ?',
        [user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    if (subscriptionCount >= 5) {
      return res.status(400).json({
        success: false,
        error: 'Bạn chỉ có thể đăng ký tối đa 5 khu vực'
      });
    }

    // Thêm đăng ký mới
    await new Promise((resolve, reject) => {
      console.log('Received ma_cong_ty_con:', ma_cong_ty_con);
      
      // Lấy thông tin công ty con trước khi insert
      const query = `SELECT cc.ma_cong_ty_con, cc.ten_cong_ty_con
                    FROM cong_ty_con cc 
                    WHERE cc.ma_cong_ty_con = ?`;
      console.log('Query:', query);
      console.log('Params:', [ma_cong_ty_con]);

      db.get(query,
        [ma_cong_ty_con],
        (err, company) => {
          if (err) {
            console.error('Database error:', err);
            reject(err);
            return;
          }
          
          console.log('Found company:', company);
          
          if (!company) {
            console.log('No company found for ma_cong_ty_con:', ma_cong_ty_con);
            reject(new Error('Không tìm thấy thông tin công ty con'));
            return;
          }
          
          // Insert với đầy đủ thông tin
          db.run(
            'INSERT INTO user_subscriptions (user_id, ma_cong_ty_con, ten_cong_ty_con) VALUES (?, ?, ?)',
            [user_id, ma_cong_ty_con, company.ten_cong_ty_con],
            (err) => {
              if (err) {
                console.error('Insert error:', err);
                reject(err);
              }
              else resolve();
            }
          );
        }
      );
    });

    res.json({
      success: true,
      message: 'Đăng ký thành công'
    });

  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server'
    });
  }
});

// Route để hủy đăng ký theo dõi
app.post('/subscriptions/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM user_subscriptions WHERE id = ? AND user_id = ?',
        [id, user_id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.redirect('/subscriptions');
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).send('Lỗi server');
  }
});

// Middleware kiểm tra đăng nhập
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/google');
}

// Thêm user vào tất cả các views
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// Middleware kiểm tra API authentication
async function checkApiAuth(req, res, next) {
  const googleId = req.headers['x-google-id'];
  
  if (!googleId) {
    return res.status(401).json({
      success: false,
      error: 'Missing X-Google-ID header'
    });
  }

  try {
    // Kiểm tra google_id có tồn tại trong database không
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE google_id = ?', [googleId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid X-Google-ID'
      });
    }

    // Lưu thông tin user vào request để có thể sử dụng ở các middleware tiếp theo
    req.user = user;
    next();
  } catch (error) {
    console.error('Lỗi xác thực API:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server'
    });
  }
}

// API lấy danh sách công ty điện lực
app.get('/api/companies', checkApiAuth, async (req, res) => {
  const { zone } = req.query;
  
  try {
    // Lấy danh sách công ty và công ty con
    const companies = await new Promise((resolve, reject) => {
      let query = `
        SELECT 
          c.id_cong_ty,
          c.ten_cong_ty,
          c.zone,
          cc.ma_cong_ty_con,
          cc.ten_cong_ty_con
        FROM cong_ty_dien_luc c
        LEFT JOIN cong_ty_con cc ON c.id_cong_ty = cc.id_cong_ty_cha
      `;
      
      const params = [];
      if (zone) {
        query += ' WHERE c.zone = ?';
        params.push(zone);
      }
      
      query += ' ORDER BY c.ten_cong_ty, cc.ten_cong_ty_con';
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Chuyển đổi dữ liệu thành cấu trúc phân cấp
    const companiesMap = new Map();
    companies.forEach(row => {
      if (!companiesMap.has(row.id_cong_ty)) {
        companiesMap.set(row.id_cong_ty, {
          id_cong_ty: row.id_cong_ty,
          ten_cong_ty: row.ten_cong_ty,
          zone: row.zone,
          cong_ty_con: []
        });
      }
      
      if (row.ma_cong_ty_con) {
        companiesMap.get(row.id_cong_ty).cong_ty_con.push({
          ma_cong_ty_con: row.ma_cong_ty_con,
          ten_cong_ty_con: row.ten_cong_ty_con
        });
      }
    });

    res.json({
      success: true,
      data: {
        companies: Array.from(companiesMap.values())
      }
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server'
    });
  }
});

app.get('/api/subcompanies', checkApiAuth, async (req, res) => {
  const { company } = req.query;
  
  if (!company) {
    return res.status(400).json({
      success: false,
      error: 'Missing company parameter'
    });
  }

  try {
    const subCompanies = await new Promise((resolve, reject) => {
      db.all(
        'SELECT ma_cong_ty_con, ten_cong_ty_con FROM cong_ty_con WHERE id_cong_ty_cha = ?',
        [company],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json({
      success: true,
      data: {
        companies: subCompanies
      }
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server'
    });
  }
});

// API lấy danh sách lịch cúp điện
app.get('/api/outages', checkApiAuth, async (req, res) => {
  const { zone, ma_dien_luc, ma_cong_ty_con, start_date, end_date, page = 1, limit = 20 } = req.query;
  
  try {
    let query = `
      SELECT 
        lcd.*,
        c.ten_cong_ty as ten_dien_luc,
        cc.ten_cong_ty_con
      FROM lich_cup_dien lcd
      LEFT JOIN cong_ty_dien_luc c ON lcd.ma_dien_luc = c.id_cong_ty
      LEFT JOIN cong_ty_con cc ON lcd.ma_cong_ty_con = cc.ma_cong_ty_con
      WHERE 1=1
    `;
    
    const params = [];
    
    if (start_date) {
      query += ` AND datetime(thoi_gian_bat_dau) >= datetime(?)`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND datetime(thoi_gian_bat_dau) <= datetime(?)`;
      params.push(end_date);
    }

    if (zone) {
      query += ` AND lcd.zone = ?`;
      params.push(zone);
    }
    
    if (ma_dien_luc) {
      query += ` AND lcd.ma_dien_luc = ?`;
      params.push(ma_dien_luc);
    }

    if (ma_cong_ty_con) {
      query += ` AND lcd.ma_cong_ty_con = ?`;
      params.push(ma_cong_ty_con);
    }
    
    query += ` ORDER BY lcd.thoi_gian_bat_dau DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const items = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    res.json({
      success: true,
      data: {
        items: items.map(item => ({
          id: item.id,
          ma_dien_luc: item.ma_dien_luc,
          ten_dien_luc: item.ten_dien_luc,
          ma_cong_ty_con: item.ma_cong_ty_con,
          ten_cong_ty_con: item.ten_cong_ty_con,
          thoi_gian_bat_dau: item.thoi_gian_bat_dau,
          thoi_gian_ket_thuc: item.thoi_gian_ket_thuc,
          khu_vuc: item.khu_vuc,
          ly_do: item.ly_do,
          zone: item.zone
        }))
      }
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server'
    });
  }
});

// Route trang chủ
app.get('/', async (req, res) => {
  const { zone } = req.query;
  
  try {
    const congty = await new Promise((resolve, reject) => {
      let query = `
        SELECT c.*, COUNT(cc.id) as so_cong_ty_con 
        FROM cong_ty_dien_luc c
        LEFT JOIN cong_ty_con cc ON c.id_cong_ty = cc.id_cong_ty_cha
      `;
      
      const params = [];
      if (zone) {
        query += ' WHERE c.zone = ?';
        params.push(zone);
      }
      
      query += ' GROUP BY c.id_cong_ty ORDER BY c.ten_cong_ty';
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.render('index', { 
      congty,
      currentZone: zone,
      user: req.user
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).send('Lỗi server');
  }
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

app.get('/lich-cup-dien', async (req, res) => {
  let { zone, ma_dien_luc, ma_cong_ty_con, date, page = 1, limit = 20, format } = req.query;
  console.log('Received params:', req.query);
  
  // Nếu format là json, trả về dữ liệu dạng JSON
  if (format === 'json') {
    try {
      console.log('Querying database for ma_cong_ty_con:', ma_cong_ty_con);
      const result = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM lich_cup_dien 
           WHERE ma_cong_ty_con = ? 
           AND date(thoi_gian_bat_dau) >= date('now')
           ORDER BY thoi_gian_bat_dau ASC`,
           [ma_cong_ty_con],
           (err, rows) => {
             if (err) reject(err);
             else resolve(rows || []);
           }
        );
      });
      console.log('Query result:', result);
      return res.json(result);
    } catch (error) {
      console.error('Lỗi:', error);
      return res.status(500).json({ error: 'Lỗi server' });
    }
  }

  // Nếu không có date được chọn, sử dụng ngày hiện tại
  if (!date) {
    const today = new Date();
    date = today.toISOString().split('T')[0]; // Format YYYY-MM-DD
  }

  // Hàm helper để tạo URL phân trang
  const getPageUrl = (pageNum) => {
    const url = new URL(`${req.protocol}://${req.get('host')}${req.path}`);
    const searchParams = new URLSearchParams(req.query);
    searchParams.set('page', pageNum);
    return '?' + searchParams.toString();
  };
  
  try {
    // Nếu không có zone được chọn, trả về trang mặc định
    if (!zone) {
      return res.render('lich-cup-dien', {
        lichCupDien: [],
        congTyList: [],
        congTyConList: [],
        currentZone: null,
        currentDate: date,
        currentMaDienLuc: null,
        currentMaCongTyCon: null,
        capNhatGanNhat: null,
        pagination: {
          page: 1,
          limit,
          totalItems: 0,
          totalPages: 0
        },
        getPageUrl: () => '#',
        user: req.user
      });
    }

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
      const whereClause = ` AND date(thoi_gian_bat_dau) >= date(?)`;
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
    params.push(limit, (page - 1) * limit);

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
      getPageUrl,
      user: req.user
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

// Route đăng nhập
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/subscriptions');
  }
  res.render('login');
});

// Route đăng xuất
app.get('/auth/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// API Routes
app.get('/api', (req, res) => {
  res.render('api', {
    user: req.user,
    path: '/api'
  });
});

// Route điều khoản sử dụng
app.get('/terms', (req, res) => {
  res.render('terms', { 
    user: req.user,
    path: '/terms'
  });
});

// Route chính sách bảo mật
app.get('/privacy', (req, res) => {
  res.render('privacy', { 
    user: req.user,
    path: '/privacy'
  });
});

// Route nguồn dữ liệu
app.get('/data-sources', (req, res) => {
  res.render('data-sources', { 
    user: req.user,
    path: '/data-sources'
  });
});

app.listen(port, () => {
  console.log(`Webapp đang chạy tại http://localhost:${port}`);
}); 
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { initializeDatabase, saveCongTyDienLuc, saveCongTyCon, db } = require('./database');

// Tạo instance axios với cấu hình bỏ qua verify SSL
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

const congTyDienLucMienBac = [
  {
    "value": "PA01",
    "label": "Công ty Điện lực Nam Định"
  },
  {
    "value": "PA02",
    "label": "Công ty Điện lực Phú Thọ"
  },
  {
    "value": "PA03",
    "label": "Công ty Điện lực Quảng Ninh"
  },
  {
    "value": "PA04",
    "label": "Công ty Điện lực Thái Nguyên"
  },
  {
    "value": "PA05",
    "label": "Công ty Điện lực Bắc Giang"
  },
  {
    "value": "PA07",
    "label": "Công ty Điện lực Thanh Hóa"
  },
  {
    "value": "PA09",
    "label": "Công ty Điện lực Thái Bình"
  },
  {
    "value": "PA10",
    "label": "Công ty Điện lực Yên Bái"
  },
  {
    "value": "PA11",
    "label": "Công ty Điện lực Lạng Sơn"
  },
  {
    "value": "PA12",
    "label": "Công ty Điện lực Tuyên Quang"
  },
  {
    "value": "PA13",
    "label": "Công ty Điện lực Nghệ An"
  },
  {
    "value": "PA14",
    "label": "Công ty Điện lực Cao Bằng"
  },
  {
    "value": "PA15",
    "label": "Công ty Điện lực Sơn La"
  },
  {
    "value": "PA16",
    "label": "Công ty Điện lực Hà Tĩnh"
  },
  {
    "value": "PA17",
    "label": "Công ty Điện lực Hòa Bình"
  },
  {
    "value": "PA18",
    "label": "Công ty Điện lực Lào Cai"
  },
  {
    "value": "PA19",
    "label": "Công ty Điện lực Điện Biên"
  },
  {
    "value": "PA20",
    "label": "Công ty Điện lực Hà Giang"
  },
  {
    "value": "PA22",
    "label": "Công ty Điện lực Bắc Ninh"
  },
  {
    "value": "PA23",
    "label": "Công ty Điện lực Hưng Yên"
  },
  {
    "value": "PA25",
    "label": "Công ty Điện lực Vĩnh Phúc"
  },
  {
    "value": "PA24",
    "label": "Công ty Điện lực Hà Nam"
  },
  {
    "value": "PA26",
    "label": "Công ty Điện lực Bắc Kạn"
  },
  {
    "value": "PA29",
    "label": "Công ty Điện lực Lai Châu"
  },
  {
    "value": "PH",
    "label": "Công ty TNHH MTV Điện lực Hải Phòng"
  },
  {
    "value": "PM",
    "label": "Công ty TNHH MTV Điện lực Hải Dương"
  },
  {
    "value": "PN",
    "label": "Công ty TNHH MTV Điện lực Ninh Bình"
  }
];

async function getDienLucList(maCongTy) {
  try {
    const response = await axiosInstance.get(`https://cskh.npc.com.vn/ThongTinKhachHang/GetDienLuc?macty=${maCongTy}`);
    const $ = cheerio.load(response.data);
    
    const danhSachCongTyCon = [];
    
    $('option').each((index, element) => {
      const value = $(element).attr('value');
      const text = $(element).text().trim();
      if (value && text) { // Chỉ lấy những option có giá trị
        danhSachCongTyCon.push({
          ma_cong_ty_con: value,
          ten_cong_ty_con: text
        });
      }
    });

    return danhSachCongTyCon;
  } catch (error) {
    console.error(`Lỗi khi lấy dữ liệu cho mã công ty ${maCongTy}:`, error.message);
    return [];
  }
}

async function crawlMienBac() {
  try {
    // Sử dụng danh sách cứng thay vì gọi API
    for (const congTy of congTyDienLucMienBac) {
      if (congTy.value) { // Bỏ qua option trống
        console.log(`Đang xử lý công ty: ${congTy.label}`);
        
        // Lưu công ty chính
        await saveCongTyDienLuc({
          id_cong_ty: congTy.value,
          ten_cong_ty: congTy.label,
          zone: 'mien_bac'
        });

        // Lấy và lưu danh sách công ty con
        const danhSachCongTyCon = await getDienLucList(congTy.value);
        console.log(`Tìm thấy ${danhSachCongTyCon.length} công ty con`);
        
        for (const congTyCon of danhSachCongTyCon) {
          if (congTyCon.ma_cong_ty_con) {
            await saveCongTyCon({
              ma_cong_ty_con: congTyCon.ma_cong_ty_con,
              ten_cong_ty_con: congTyCon.ten_cong_ty_con,
              zone: 'mien_bac'
            }, congTy.value);
            console.log(`  → Đã lưu: ${congTyCon.ten_cong_ty_con}`);
          }
        }
        
        console.log(`✓ Đã lưu dữ liệu cho công ty ${congTy.label}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Lỗi khi crawl miền Bắc:', error);
    throw error; // Ném lỗi để main function có thể bắt được
  }
}

async function main() {
  try {
    await initializeDatabase();
    console.log('✓ Đã khởi tạo database thành công');

    // Kiểm tra database đã được tạo đúng chưa
    await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='cong_ty_dien_luc'", [], (err, row) => {
        if (err) reject(err);
        if (!row) reject(new Error('Bảng cong_ty_dien_luc chưa được tạo'));
        console.log('✓ Đã tìm thấy bảng cong_ty_dien_luc');
        resolve();
      });
    });

    await crawlMienBac();
    
    // Kiểm tra dữ liệu đã được lưu
    await new Promise((resolve, reject) => {
      db.all("SELECT * FROM cong_ty_dien_luc WHERE zone = 'mien_bac'", [], (err, rows) => {
        if (err) reject(err);
        console.log(`✓ Đã lưu ${rows.length} công ty điện lực miền Bắc`);
        resolve();
      });
    });

    console.log('✓ Hoàn thành việc lưu dữ liệu miền Bắc');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

// Thêm đoạn này để đảm bảo đóng kết nối database khi kết thúc
process.on('exit', () => {
  db.close();
});

main().catch(console.error); 
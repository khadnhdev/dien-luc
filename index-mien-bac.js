const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { initializeDatabase, saveCongTyDienLuc, saveCongTyCon } = require('./database');

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
    // Sử dụng axiosInstance thay vì axios
    const response = await axiosInstance.get(`https://cskh.npc.com.vn/ThongTinKhachHang/GetDienLuc?macty=${maCongTy}`);
    const $ = cheerio.load(response.data);
    
    const danhSachCongTyCon = [];
    
    $('option').each((index, element) => {
      danhSachCongTyCon.push({
        ma_cong_ty_con: $(element).attr('value'),
        ten_cong_ty_con: $(element).text().trim()
      });
    });

    return danhSachCongTyCon;
  } catch (error) {
    console.error(`Lỗi khi lấy dữ liệu cho mã công ty ${maCongTy}:`, error.message);
    return [];
  }
}

async function main() {
  try {
    // Khởi tạo database
    await initializeDatabase();
    console.log('Đã khởi tạo database thành công');

    for (const congTy of congTyDienLucMienBac) {
      if (congTy.value) { // Bỏ qua option trống
        // Lưu thông tin công ty chính
        const congTyData = {
          id_cong_ty: congTy.value,
          ten_cong_ty: congTy.label,
          zone: 'mien_bac'
        };
        await saveCongTyDienLuc(congTyData);
        
        // Lấy và lưu thông tin công ty con
        const danhSachCongTyCon = await getDienLucList(congTy.value);
        for (const congTyCon of danhSachCongTyCon) {
          await saveCongTyCon({
            ...congTyCon,
            zone: 'mien_bac'
          }, congTy.value);
        }
        
        console.log(`Đã lưu dữ liệu cho công ty ${congTy.label}`);
        
        // Thêm delay để tránh bị block
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('Hoàn thành việc lưu dữ liệu miền Bắc');
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

main().catch(console.error); 
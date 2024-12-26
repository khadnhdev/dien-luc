const axios = require('axios');
const { initializeDatabase, saveCongTyDienLuc, saveCongTyCon } = require('./database');

const congTyDienLucMienTrung = [
  {
    "value": "PC",
    "label": "Tổng Công Ty Điện lực Miền Trung"
  },
  {
    "value": "PC01",
    "label": "Công ty Điện lực Quảng Bình"
  },
  {
    "value": "PC02",
    "label": "Công ty Điện lực Quảng Trị"
  },
  {
    "value": "PC03",
    "label": "Công ty Điện lực TT Huế"
  },
  {
    "value": "PP",
    "label": "Công ty TNHH MTV Điện lực Đà Nẵng"
  },
  {
    "value": "PC05",
    "label": "Công ty Điện lực Quảng Nam"
  },
  {
    "value": "PC06",
    "label": "Công ty Điện lực Quảng Ngãi"
  },
  {
    "value": "PC07",
    "label": "Công ty Điện lực Bình Định"
  },
  {
    "value": "PC08",
    "label": "Công ty Điện lực Phú Yên"
  },
  {
    "value": "PQ",
    "label": "Công ty CP Điện lực Khánh Hoà"
  },
  {
    "value": "PC10",
    "label": "Công ty Điện lực Gia Lai"
  },
  {
    "value": "PC11",
    "label": "Công ty Điện lực Kon Tum"
  },
  {
    "value": "PC12",
    "label": "Công ty Điện lực Đăk Lăk"
  },
  {
    "value": "PC13",
    "label": "Công ty Điện lực Đăk Nông"
  }
];

async function getDienLucList(maCongTy) {
  try {
    const response = await axios.get(`https://cskh-api.cpc.vn/api/remote/organizations?maDonViCapTren=${maCongTy}`);
    
    if (response.data && Array.isArray(response.data)) {
      return response.data.map(item => ({
        ma_cong_ty_con: item.code,
        ten_cong_ty_con: item.organizationName
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`Lỗi khi lấy dữ liệu cho mã công ty ${maCongTy}:`, error.message);
    return [];
  }
}

async function crawlMienTrung() {
  try {
    for (const congTy of congTyDienLucMienTrung) {
      if (congTy.value) { // Bỏ qua option trống
        // Lưu thông tin công ty chính
        await saveCongTyDienLuc({
          id_cong_ty: congTy.value,
          ten_cong_ty: congTy.label,
          zone: 'mien_trung'
        });
        
        // Lấy và lưu thông tin công ty con
        const danhSachCongTyCon = await getDienLucList(congTy.value);
        for (const congTyCon of danhSachCongTyCon) {
          if (congTyCon.ma_cong_ty_con) { // Kiểm tra để bỏ qua option trống
            await saveCongTyCon({
              ...congTyCon,
              zone: 'mien_trung'
            }, congTy.value);
          }
        }
        
        console.log(`Đã lưu dữ liệu cho công ty ${congTy.label}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1s
      }
    }
  } catch (error) {
    console.error('Lỗi khi crawl miền Trung:', error);
  }
}

async function main() {
  try {
    await initializeDatabase();
    console.log('Đã khởi tạo database thành công');

    await crawlMienTrung();
    console.log('Hoàn thành việc lưu dữ liệu miền Trung');
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

main().catch(console.error); 
const axios = require('axios');
const cheerio = require('cheerio');
const { initializeDatabase, saveCongTyDienLuc, saveCongTyCon, addZoneColumn } = require('./database');
const congTyDienLuc = require('./companies');

async function getDienLucList(maCongTy) {
  try {
    const response = await axios.get(`https://www.cskh.evnspc.vn/LienHe/getDienLucList?pMA_DVICTREN=${maCongTy}`);
    const $ = cheerio.load(response.data);
    
    const danhSachCongTyCon = [];
    
    $('select option').each((index, element) => {
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

    // Thực hiện migration để thêm cột zone
    await addZoneColumn();
    console.log('Đã thêm cột zone thành công');

    for (const congTy of congTyDienLuc) {
      if (congTy.value) { // Bỏ qua option trống
        // Lưu thông tin công ty chính với zone
        const congTyData = {
          id_cong_ty: congTy.value,
          ten_cong_ty: congTy.label,
          zone: 'mien_nam' // Thêm thông tin zone
        };
        await saveCongTyDienLuc(congTyData);
        
        // Lấy và lưu thông tin công ty con
        const danhSachCongTyCon = await getDienLucList(congTy.value);
        for (const congTyCon of danhSachCongTyCon) {
          await saveCongTyCon(congTyCon, congTy.value);
        }
        
        console.log(`Đã lưu dữ liệu cho công ty ${congTy.label}`);
      }
    }

    console.log('Hoàn thành việc lưu dữ liệu');
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

main().catch(console.error); 
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { db } = require('./database');
const { initializeOutagesDatabase, saveLichCupDien, saveCapNhat } = require('./database-outages');

// Tạo instance axios với cấu hình bỏ qua verify SSL
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

// Hàm lấy danh sách công ty từ database
async function getCongTyList() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        c.id_cong_ty, 
        c.ten_cong_ty, 
        c.zone,
        cc.ma_cong_ty_con, 
        cc.ten_cong_ty_con,
        cc.zone as sub_zone
      FROM cong_ty_dien_luc c
      INNER JOIN cong_ty_con cc ON c.id_cong_ty = cc.id_cong_ty_cha
      WHERE c.zone = cc.zone  -- Đảm bảo công ty con cùng miền với công ty mẹ
      ORDER BY c.zone, c.ten_cong_ty, cc.ten_cong_ty_con
    `, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Nhóm các công ty con theo công ty mẹ và miền
        const groupedCompanies = rows.reduce((acc, row) => {
          const key = `${row.id_cong_ty}_${row.zone}`;
          if (!acc[key]) {
            acc[key] = {
              id_cong_ty: row.id_cong_ty,
              ten_cong_ty: row.ten_cong_ty,
              zone: row.zone,
              subCompanies: []
            };
          }
          if (row.ma_cong_ty_con) {
            acc[key].subCompanies.push({
              ma_cong_ty_con: row.ma_cong_ty_con,
              ten_cong_ty_con: row.ten_cong_ty_con,
              zone: row.sub_zone
            });
          }
          return acc;
        }, {});

        resolve(Object.values(groupedCompanies));
      }
    });
  });
}

async function crawlMienTrung(congTy) {
  try {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const fromDate = today.toISOString().split('T')[0] + ' 00:00:00';
    const toDate = nextMonth.toISOString().split('T')[0] + ' 23:59:59';

    for (const subCompany of congTy.subCompanies) {
      console.log(`  → Đang cào ${subCompany.ten_cong_ty_con}...`);
      const response = await axiosInstance.get(
        `https://cskh-api.cpc.vn/api/remote/outages/area?orgCode=${congTy.id_cong_ty}&subOrgCode=${subCompany.ma_cong_ty_con}&fromDate=${fromDate}&toDate=${toDate}&page=1&limit=100`
      );

      if (response.data && response.data.items) {
        const count = response.data.items.length;
        console.log(`    → Tìm thấy ${count} lịch cúp điện`);
        totalOutages += count;
        for (const item of response.data.items) {
          await saveLichCupDien({
            ma_dien_luc: congTy.id_cong_ty,
            ten_dien_luc: congTy.ten_cong_ty,
            ma_tram: item.stationCode,
            ten_tram: item.stationName,
            thoi_gian_bat_dau: item.fromDate,
            thoi_gian_ket_thuc: item.toDate,
            khu_vuc: item.stationName,
            ly_do: item.reason,
            trang_thai: item.statusStr,
            loai_cat_dien: item.outageType,
            zone: congTy.zone
          });
        }
      } else {
        console.log('    → Không tìm thấy lịch cúp điện');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`  ❌ Lỗi khi cào ${congTy.ten_cong_ty}: ${error.message}`);
  }
}

async function crawlMienNam(congTy) {
  try {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const tuNgay = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
    const denNgay = `${nextMonth.getDate()}-${nextMonth.getMonth() + 1}-${nextMonth.getFullYear()}`;

    for (const subCompany of congTy.subCompanies) {
      console.log(`  → Đang cào ${subCompany.ten_cong_ty_con}...`);
      const response = await axios.get(
        `https://www.cskh.evnspc.vn/TraCuu/GetThongTinLichNgungGiamMaKhachHang?madvi=${subCompany.ma_cong_ty_con}&tuNgay=${tuNgay}&denNgay=${denNgay}&ChucNang=MaDonVi`
      );

      const $ = cheerio.load(response.data);
      let count = 0;
      $('table tbody tr').each(async (index, element) => {
        count++;
        const tds = $(element).find('td');
        
        const formatDateTime = (dateTimeStr) => {
          const [date, time] = dateTimeStr.split(' ');
          const [day, month, year] = date.split('/');
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${time}`;
        };

        const thoiGianBatDau = formatDateTime($(tds[0]).text().trim());
        const thoiGianKetThuc = formatDateTime($(tds[1]).text().trim());

        await saveLichCupDien({
          ma_dien_luc: congTy.id_cong_ty,
          ten_dien_luc: congTy.ten_cong_ty,
          ma_tram: '',
          ten_tram: '',
          thoi_gian_bat_dau: thoiGianBatDau,
          thoi_gian_ket_thuc: thoiGianKetThuc,
          khu_vuc: $(tds[2]).text().trim(),
          ly_do: $(tds[3]).text().trim(),
          trang_thai: '',
          loai_cat_dien: '',
          zone: congTy.zone
        });
      });
      console.log(`    → Tìm thấy ${count} lịch cúp điện`);
      totalOutages += count;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`  ❌ Lỗi khi cào ${congTy.ten_cong_ty}: ${error.message}`);
  }
}

async function crawlMienBac(congTy) {
  try {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const tuNgay = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
    const denNgay = `${nextMonth.getDate()}/${nextMonth.getMonth() + 1}/${nextMonth.getFullYear()}`;

    for (const subCompany of congTy.subCompanies) {
      console.log(`  → Đang cào ${subCompany.ten_cong_ty_con}...`);
      const response = await axiosInstance.get(
        `https://cskh.npc.com.vn/ThongTinKhachHang/LichNgungGiamCungCapDienSPC?madvi=${subCompany.ma_cong_ty_con}&tuNgay=${tuNgay}&denNgay=${denNgay}`
      );

      const $ = cheerio.load(response.data);
      let count = 0;
      $('.table tbody tr').each(async (index, element) => {
        count++;
        const tds = $(element).find('td');
        await saveLichCupDien({
          ma_dien_luc: congTy.id_cong_ty,
          ten_dien_luc: congTy.ten_cong_ty,
          ma_tram: '',
          ten_tram: '',
          thoi_gian_bat_dau: $(tds[2]).text().trim(),
          thoi_gian_ket_thuc: $(tds[3]).text().trim(),
          khu_vuc: $(tds[4]).text().trim(),
          ly_do: $(tds[5]).text().trim(),
          trang_thai: '',
          loai_cat_dien: '',
          zone: congTy.zone
        });
      });
      console.log(`    → Tìm thấy ${count} lịch cúp điện`);
      totalOutages += count;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`  ❌ Lỗi khi cào ${congTy.ten_cong_ty}: ${error.message}`);
  }
}

async function main() {
  const startTime = new Date();
  let totalOutages = 0;
  
  try {
    console.log('=== Bắt đầu quá trình cào dữ liệu lịch cúp điện ===');
    console.log(`Thời gian bắt đầu: ${startTime.toLocaleString('vi-VN')}`);
    
    await initializeOutagesDatabase();
    console.log('✓ Đã khởi tạo database lịch cúp điện');

    const congTyList = await getCongTyList();
    console.log(`\nTìm thấy tổng cộng ${congTyList.length} công ty điện lực`);

    // Phân loại công ty theo miền
    const congTyMienBac = congTyList.filter(c => c.zone === 'mien_bac');
    const congTyMienTrung = congTyList.filter(c => c.zone === 'mien_trung');
    const congTyMienNam = congTyList.filter(c => c.zone === 'mien_nam');

    // Crawl miền Bắc
    console.log(`\n=== Đang cào dữ liệu ${congTyMienBac.length} công ty miền Bắc ===`);
    for (const [index, congTy] of congTyMienBac.entries()) {
      console.log(`[${index + 1}/${congTyMienBac.length}] Đang cào ${congTy.ten_cong_ty}...`);
      for (const subCompany of congTy.subCompanies) {
        console.log(`  → Đang cào ${subCompany.ten_cong_ty_con}...`);
        await crawlMienBac({
          ...congTy,
          ma_cong_ty_con: subCompany.ma_cong_ty_con,
          ten_cong_ty_con: subCompany.ten_cong_ty_con
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    console.log('✓ Hoàn thành cào dữ liệu miền Bắc');

    // Crawl miền Trung
    console.log(`\n=== Đang cào dữ liệu ${congTyMienTrung.length} công ty miền Trung ===`);
    for (const [index, congTy] of congTyMienTrung.entries()) {
      console.log(`[${index + 1}/${congTyMienTrung.length}] Đang cào ${congTy.ten_cong_ty}...`);
      await crawlMienTrung(congTy);
    }
    console.log('✓ Hoàn thành cào dữ liệu miền Trung');

    // Crawl miền Nam
    console.log(`\n=== Đang cào dữ liệu ${congTyMienNam.length} công ty miền Nam ===`);
    for (const [index, congTy] of congTyMienNam.entries()) {
      console.log(`[${index + 1}/${congTyMienNam.length}] Đang cào ${congTy.ten_cong_ty}...`);
      await crawlMienNam(congTy);
    }
    console.log('✓ Hoàn thành cào dữ liệu miền Nam');

    const endTime = new Date();
    const totalTime = (endTime - startTime) / 1000; // Đổi sang giây
    
    // Lưu thông tin cập nhật
    await saveCapNhat({
      thoi_gian_bat_dau: startTime.toISOString(),
      thoi_gian_ket_thuc: endTime.toISOString(),
      tong_thoi_gian: totalTime,
      so_lich_cup_dien: totalOutages
    });

    // In thống kê
    console.log('\n=== Thống kê quá trình cào dữ liệu ===');
    console.log(`Thời gian bắt đầu: ${startTime.toLocaleString('vi-VN')}`);
    console.log(`Thời gian kết thúc: ${endTime.toLocaleString('vi-VN')}`);
    console.log(`Tổng thời gian: ${Math.floor(totalTime / 60)} phút ${Math.floor(totalTime % 60)} giây`);
    console.log(`Tổng số lịch cúp điện: ${totalOutages}`);
    console.log('\n=== Kết thúc quá trình cào dữ liệu ===');

  } catch (error) {
    console.error('\n❌ Lỗi:', error);
  }
}

module.exports = {
  crawlMienTrung,
  crawlMienNam,
  crawlMienBac
};

if (require.main === module) {
  main().catch(console.error);
} 
import * as F from "/sessions/rcw-01g5wcsaxjvoprd6g6vdjdwa/mnt/UI-OPS/lib/vcrrmFee.js";
const r = F.calcRow({ typeIdx: 1, area: 287, months: 1, province: "TP. Hồ Chí Minh" });
console.log("sheet example (expect 20240000/1686667/168667/1855334):", r.year, r.term, r.vat, r.total, r.coef.toFixed(2), r.capped);
console.log(F.detectProvince("123 Nguyễn Huệ, Q1, TP.HCM"), "|", F.detectProvince("45 Lê Lợi, Huế"), "|", F.detectProvince("Phố Huế, Hà Nội"), "|", F.detectProvince("12 abc Cần Thơ"), "|", JSON.stringify(F.detectProvince("Bình Dương")));
console.log(F.matchProvince("HCM"), F.matchProvince("TP. Hồ Chí Minh"), F.matchProvince("Thanh pho Da Nang"), F.matchProvince("Hà Nội"));
console.log([ "Cà phê", "nhà hàng", "Cửa hàng", "Phòng gym", "Khu vui chơi giải trí", "TTTM", "siêu thị", "3", "karaoke" ].map(F.matchType));
const rows = F.parsePaste("Tên cơ sở\tĐịa chỉ\tTỉnh\tLoại hình\tDiện tích\tThời hạn\nQuán A\t1 Lê Lợi, Quận 1, TP.HCM\t\tCà phê\t80\t12\nQuán B\t2 Trần Phú, Đà Nẵng\tĐà Nẵng\tNhà hàng\t287,5\t");
console.log(rows.length, rows.map(r=>[r.province,r.typeIdx,r.area,r.months]).join(" ; "));
console.log(rows.map(r=>F.calcRow(r)).map(x=>x.ok?x.total:x.err).join(" ; "));

# Trạm Phóng K20

Mô phỏng phóng tên lửa thật bằng 3D (WebGL / Three.js), chạy trực tiếp trong trình duyệt.

- **Starship** (Super Heavy + Ship), Block 2 với Raptor 2 hoặc Block 3 với Raptor 3. Phóng từ Starbase; booster quay về để tháp Mechazilla bắt bằng "đũa".
- **Falcon 9** Block 5. Phóng từ LC-39A; tầng 1 hạ cánh trên sà lan giữa biển hoặc về bãi LZ.

Mỗi động cơ được mô phỏng riêng, kể cả từng chiếc trong 33 Raptor của Super Heavy hay 9 Merlin của Falcon 9. Mỗi chiếc có serial, số lần bay, độ bền, ga, góc gimbal và luồng lửa riêng, có thể hỏng riêng.

## Chơi

Mở `index.html` bằng Chrome, Edge hoặc Firefox. Lần đầu cần mạng để tải Three.js từ CDN.

1. **Tên lửa**: chọn phương tiện và phiên bản. Với Falcon 9, chọn thêm số chuyến booster đã bay (càng nhiều chuyến, muội than càng dày).
2. **Động cơ**: bấm vào từng động cơ để xem thông số. Thử nổ tĩnh để tìm động cơ yếu, rồi thay mới hoặc loại khỏi chuyến bay.
3. **Nhiệm vụ**: chọn kiểu thu hồi, khối lượng hàng, quỹ đạo, giờ phóng, gió, mây và độ khó. Máy tính tự lập quỹ đạo và đặt sà lan.
4. **Phóng**: chạy bảng GO/NO-GO rồi đếm ngược.

Phím tắt:

| Phím | Tác dụng |
|---|---|
| `Space` | Phóng / tua nhanh |
| `C` | Đổi camera |
| `B` / `U` | Theo booster / theo tầng trên |
| `W` `S` `A` `D` | Lái tay khi hạ cánh |
| `T` | Bật/tắt vệt quỹ đạo |
| `F` | Toàn màn hình |
| `M` | Tắt/bật tiếng |

Bản 2D tên lửa mô hình cũ nằm ở `classic.html`.

## Mã nguồn

`index.html` được ghép từ `src3d/`:

```
node src3d/build.mjs     # tạo index.html và dist/artifact.html
```

| File | Nội dung |
|---|---|
| `00-core.js` | Tiện ích, hằng số vật lý |
| `01-render.js` | Renderer, bloom, khử răng cưa, tự hạ độ phân giải để giữ ≥ 30 FPS |
| `02-textures.js` | Texture thủ tục: thép, gạch tản nhiệt lục giác, muội than, bê tông… |
| `03-world.js` | Bầu trời tán xạ khí quyển, mặt đất trên Trái Đất cong, mây, Starbase, LC-39A, sà lan |
| `04-engines.js` | Thông số và mô hình Raptor 2/3, RVac, Merlin 1D, MVac; plume shader |
| `05-vehicles.js` | Kích thước, khối lượng, bố trí động cơ thật; dựng mô hình 3D |
| `06-physics.js` | Khí quyển chuẩn, quỹ đạo, dẫn đường: Max-Q, hot staging, boostback, entry, landing, đỡ đũa, vào quỹ đạo |
| `07-fx.js` | Hạt: hơi nước deluge, khói, vệt ngưng tụ, khí giãn nở lúc hoàng hôn, nổ, vapor cone |
| `08-audio.js` | Âm thanh không gian: trễ theo khoảng cách (343 m/s), không khí loãng, sonic boom |
| `09-ui.js` | Bảng cấu hình, HUD kiểu webcast, kết quả, nhiệm vụ |
| `10-main.js` | Trạng thái game, camera, vòng lặp |

Thông số tham khảo từ trang của SpaceX và Wikipedia (Super Heavy, Starship, Falcon 9 Block 5, Raptor).

/**
 * PUMP.FUN RELAY - Kết nối tới PumpPortal (WebSocket, free) để nhận
 * đúng sự kiện "token mới tạo" trên pump.fun, sau đó forward về
 * webhook meme.php trên cPanel qua HTTP POST.
 *
 * Chạy 24/7 trên Railway/Render (free tier) - không thể chạy trên
 * cPanel shared hosting vì cần giữ kết nối WebSocket luôn mở.
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

// ==== CẤU HÌNH - ĐIỀN THÔNG TIN CỦA BẠN ====
const WEBHOOK_URL = 'https://atomquant.online/meme.php?key=caodaica12';

let ws;
let reconnectDelay = 1000; // bắt đầu 1s, tăng dần nếu mất kết nối liên tục

function connect() {
  ws = new WebSocket('wss://pumpportal.fun/api/data');

  ws.on('open', () => {
    console.log('[relay] Đã kết nối PumpPortal');
    reconnectDelay = 1000; // reset lại delay khi kết nối thành công
    ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
  });

  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    // Chỉ xử lý sự kiện tạo token mới (bỏ qua các message khác như xác nhận subscribe)
    if (!data || !data.mint) return;

    const payload = [{
      mint: data.mint,
      creator: data.traderPublicKey || data.creator || null,
      created_at: Math.floor(Date.now() / 1000),
      initial_buy: data.initialBuy || 0,
    }];

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log(`[relay] Forward token ${data.mint} -> status ${res.status}`);
    } catch (err) {
      console.error('[relay] Lỗi forward về webhook:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[relay] Mất kết nối, thử lại sau ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000); // tối đa 30s
  });

  ws.on('error', (err) => {
    console.error('[relay] WebSocket error:', err.message);
    ws.close();
  });
}

connect();

// Giữ tiến trình sống (Railway cần 1 tiến trình chạy liên tục, không thoát)
process.on('SIGTERM', () => {
  console.log('[relay] Đang tắt...');
  if (ws) ws.close();
  process.exit(0);
});

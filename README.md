# Tanishuv UZ

Telegram Mini App frontend (GitHub Pages) va alohida Node.js API/bot uchun boshlang‘ich loyiha.

## Mahalliy ishga tushirish

1. Node.js 20 yoki yangiroq versiyasini o‘rnating.
2. `npm install` bajaring.
3. `.env.example` dan `.env` nusxa oling va backend uchun maxfiy qiymatlarni kiriting.
4. PostgreSQL bazasida `schema.sql` ni ishga tushiring.
5. Terminalda `npm run dev`, boshqa terminalda `npm run server` va bot uchun `npm run bot` bajaring.
6. Frontend uchun `VITE_API_URL=http://localhost:3000` ni `.env.local` fayliga kiriting; Telegram Web App autentifikatsiyasi bot ichidan va HTTPS backend bilan ishlaydi.

Bot tokenini `.env` faylida yoki hosting provayderining maxfiy Environment Variables bo‘limida saqlang. Uni GitHub kodiga, brauzerga yoki chatga joylamang. Admin Telegram ID’larini `ADMIN_TELEGRAM_IDS` ga vergul bilan ajratib kiriting.

## GitHub Pages (HTTPS) — frontend

1. Loyihani GitHub repozitoriyaga `main` branch orqali yuklang.
2. `npm run build` bajaring va `dist` ichidagi fayllarni `docs` papkasiga nusxalang.
3. Repozitoriy sozlamalaridagi **Pages → Build and deployment → Deploy from a branch** ni tanlab, `main` va `/docs` ni belgilang.
4. Hosil bo‘lgan HTTPS URL’ni backend `CORS_ORIGINS`, build vaqtidagi `VITE_API_URL`, `.env` dagi `MINI_APP_URL` hamda BotFather Mini App sozlamasiga kiriting.

GitHub Pages faqat frontendni joylaydi. Express API, Telegram bot va PostgreSQL uchun doimiy ishlaydigan alohida backend/database hosting kerak. Backend va bot jarayonlari alohida servislar sifatida ishga tushadi.

## Guruh/kanal reklamasi

Bot guruhga qo‘shilganda o‘z-o‘zidan xabar yubormaydi. Reklama faqat guruh administratori `/ads_on` orqali aniq rozilik berganidan keyin va admin panelda yoqilganda, Toshkent vaqti bo‘yicha ko‘pi bilan kuniga ikki marta yuboriladi. `/ads_off` rozilikni bekor qiladi.

## Muhim cheklov

Admin panel bot tokeni yoki admin ID qiymatlarini hech qachon ko‘rsatmaydi; faqat serverda sozlangan/sozlanmagan holatini ko‘rsatadi. Telegram identifikatori `initData` serverda tekshiriladi, admin endpointlari esa server tomonida alohida himoyalangan.

const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');

const CSV_URL = process.env.SHEET_CSV_URL;
const SITE_URL = "https://vartagear.com.ua";

async function main() {
  try {
    if (!CSV_URL) {
      throw new Error("Помилка: Не знайдено SHEET_CSV_URL. Перевірте налаштування середовища.");
    }

    console.log("📥 Завантаження даних з Google Таблиці...");
    const response = await axios.get(CSV_URL);
    const csvData = response.data;

    // ВАЖЛИВО: Оновлюємо data.csv для вашого сайту (script.js)
    fs.writeFileSync('data.csv', csvData);
    console.log("💾 Файл data.csv успішно оновлено!");
    
    // Парсимо CSV у масив об'єктів
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });

    // Відфільтровуємо лише ті товари, кількість яких більша за 0
    const activeProducts = records.filter(p => parseInt(p.Total_Qty) > 0);
    console.log(`📦 Знайдено активних товарів: ${activeProducts.length}`);

    const today = new Date().toISOString().split('T')[0];

    // ==========================================
    // 1. ГЕНЕРАЦІЯ SITEMAP.XML
    // ==========================================
    console.log("🗺️ Генерація sitemap.xml...");
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Ваші статичні сторінки
    sitemapXml += `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    sitemapXml += `  <url>\n    <loc>${SITE_URL}/?category=tactical</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    sitemapXml += `  <url>\n    <loc>${SITE_URL}/?category=casual</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;

    // Додаємо всі активні товари
    activeProducts.forEach(p => {
      // ОНОВЛЕНО: Формат посилання /?product=VendorCode
      const productUrl = `${SITE_URL}/?product=${encodeURIComponent(p.VendorCode)}`;
      sitemapXml += `  <url>\n    <loc>${productUrl}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    });

    sitemapXml += `</urlset>`;
    fs.writeFileSync('sitemap.xml', sitemapXml);

    // ==========================================
    // 2. ГЕНЕРАЦІЯ MERCHANT.XML (Google Shopping)
    // ==========================================
    console.log("🛒 Генерація merchant.xml...");
    let merchantXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    merchantXml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n  <channel>\n`;
    merchantXml += `    <title>Varta Gear</title>\n    <link>${SITE_URL}</link>\n    <description>Military and casual gear</description>\n`;

    activeProducts.forEach(p => {
      // Беремо тільки перше фото для фіду Мерчанта
      const firstPic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';
      
      // ОНОВЛЕНО: Формат посилання /?product=VendorCode
      const productUrl = `${SITE_URL}/?product=${encodeURIComponent(p.VendorCode)}`;
      
      merchantXml += `    <item>\n`;
      merchantXml += `      <g:id>${p.VendorCode}</g:id>\n`;
      merchantXml += `      <g:title><![CDATA[${p.Name}]]></g:title>\n`;
      merchantXml += `      <g:description><![CDATA[${p.Description}]]></g:description>\n`;
      merchantXml += `      <g:link>${productUrl}</g:link>\n`;
      merchantXml += `      <g:image_link>${firstPic}</g:image_link>\n`;
      merchantXml += `      <g:condition>new</g:condition>\n`;
      merchantXml += `      <g:availability>in stock</g:availability>\n`;
      merchantXml += `      <g:price>${p.Price} UAH</g:price>\n`;
      merchantXml += `      <g:brand>Varta Gear</g:brand>\n`;
      merchantXml += `    </item>\n`;
    });

    merchantXml += `  </channel>\n</rss>`;
    fs.writeFileSync('merchant.xml', merchantXml);

    console.log("✅ Успіх! Файли data.csv, sitemap.xml та merchant.xml готові.");

  } catch (error) {
    console.error("❌ Сталася помилка:", error.message);
    process.exit(1); 
  }
}

main();

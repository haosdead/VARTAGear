const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');

const CSV_URL = process.env.SHEET_CSV_URL;
const SITE_URL = "https://vartagear.com.ua"; // Вкажіть адресу вашого сайту

async function main() {
  try {
    // 1. Завантажуємо CSV
    const response = await axios.get(CSV_URL);
    const records = parse(response.data, {
      columns: true,
      skip_empty_lines: true
    });

    // Фільтруємо товари, які є в наявності (Total_Qty > 0)
    const activeProducts = records.filter(p => parseInt(p.Total_Qty) > 0);

    // 2. ГЕНЕРУЄМО SITEMAP.XML
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    // Додаємо головну сторінку
    sitemapXml += `  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    
    // Додаємо сторінки товарів
    activeProducts.forEach(p => {
      // Припускаємо, що URL товару будується по VendorCode або назві
      sitemapXml += `  <url>\n    <loc>${SITE_URL}/product/${p.VendorCode}</loc>\n    <changefreq>weekly</changefreq><priority>0.8</priority>\n  </url>\n`;
    });
    sitemapXml += `</urlset>`;
    fs.writeFileSync('sitemap.xml', sitemapXml);

    // 3. ГЕНЕРУЄМО MERCHANT.XML (Google RSS 2.0 фід)
    let merchantXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    merchantXml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n  <channel>\n`;
    merchantXml += `    <title>Varta Gear Catalog</title>\n    <link>${SITE_URL}</link>\n    <description>Military gear feed</description>\n`;

    activeProducts.forEach(p => {
      // Обробка картинок (якщо їх кілька через кому, беремо першу)
      const firstPic = p.Pictures ? p.Pictures.split(',')[0].trim() : '';

      merchantXml += `    <item>\n`;
      merchantXml += `      <g:id>${p.VendorCode}</g:id>\n`;
      merchantXml += `      <g:title><![CDATA[${p.Name}]]></g:title>\n`;
      merchantXml += `      <g:description><![CDATA[${p.Description}]]></g:description>\n`;
      merchantXml += `      <g:link>${SITE_URL}/product/${p.VendorCode}</g:link>\n`;
      merchantXml += `      <g:image_link>${firstPic}</g:image_link>\n`;
      merchantXml += `      <g:condition>new</g:condition>\n`;
      merchantXml += `      <g:availability>in stock</g:availability>\n`;
      merchantXml += `      <g:price>${p.Price} UAH</g:price>\n`;
      if (p.Brand) merchantXml += `      <g:brand><![CDATA[${p.Brand}]]></g:brand>\n`;
      merchantXml += `    </item>\n`;
    });

    merchantXml += `  </channel>\n</rss>`;
    fs.writeFileSync('merchant.xml', merchantXml);

    console.log("✅ Файли sitemap.xml та merchant.xml успішно згенеровано!");

  } catch (error) {
    console.error("❌ Помилка генерації фідів:", error.message);
    process.exit(1);
  }
}

main();

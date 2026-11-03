require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function runDailyScrape() {
    console.log("🚀 [GITHUB ACTIONS] Starting Daily Automation Bot...");
    
    // আজকের বা গতকালকের তারিখ নির্ধারণ (সেটিংস অনুযায়ী)
    let targetDate = new Date();
    const { data: settings } = await supabase.from('automation_settings').select('*').single();
    
    if (!settings || !settings.is_active) {
        console.log("⚠️ Automation is disabled in settings. Exiting.");
        process.exit(0);
    }
    
    if (settings.is_previous_day_stock) {
        targetDate.setDate(targetDate.getDate() - 1);
    }
    const formattedDate = targetDate.toISOString().split('T')[0];
    
    console.log(`⚙️ Target Date: ${formattedDate}`);

    let browser;
    try {
        const { data: mappings } = await supabase.from('warehouse_mappings').select('*');
        if (!mappings || mappings.length === 0) throw new Error("No warehouse mappings found.");

        // headless: true (সার্ভারের জন্য)
        browser = await chromium.launch({ headless: true }); 
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log("🌐 Logging into Donor Portal...");
        await page.goto(settings.donor_url, { waitUntil: 'networkidle' });
        await page.fill('input[name="email"]', settings.donor_username); 
        await page.fill('input[name="password"]', settings.donor_password);
        await page.click('button[type="submit"]');

        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
                page.waitForSelector('.swal2-confirm', { timeout: 15000 })
            ]);
            if (await page.isVisible('.swal2-confirm')) {
                await page.click('.swal2-confirm');
                await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
            }
        } catch (e) {}

        await page.goto('https://iwms.nanoit.biz/current-total-goods-stock-report', { waitUntil: 'networkidle' });
        await page.selectOption('select[name="sector_id"]', { label: 'NFI' });
        await page.waitForLoadState('networkidle');
        await page.selectOption('select[name="partner_id"]', { label: 'ACTED' });
        await page.waitForLoadState('networkidle');

        let allExtractedData = [];

        for (const map of mappings) {
            const whCode = map.donor_wh_code;
            const whName = map.donor_wh_name || whCode;
            console.log(`▶️ Processing: ${whCode}`);

            try {
                await page.selectOption('select[name="warehouse_id"]', whCode);
            } catch(e) { continue; }
            
            await page.click('button:has-text("Search")');
            await page.waitForTimeout(2000); 

            try {
                const lengthSelect = await page.$('select[name="stock-data-table_length"]');
                if (lengthSelect) {
                    await page.selectOption('select[name="stock-data-table_length"]', '100');
                    await page.waitForTimeout(1000);
                }
            } catch(e) {}

            let hasNextPage = true;
            while (hasNextPage) {
                const pageData = await page.evaluate(() => {
                    const data = [];
                    const rows = document.querySelectorAll('table#stock-data-table tbody tr'); 
                    rows.forEach(row => {
                        const cols = row.querySelectorAll('td');
                        if (cols.length >= 6 && !cols[0].innerText.includes('No data')) {
                            const pCode = cols[1].innerText.trim();
                            if (pCode) {
                                data.push({
                                    product_code: pCode,
                                    product_name: cols[2].innerText.trim(),
                                    quantity: parseFloat(cols[4].innerText.replace(/,/g, '')) || 0
                                });
                            }
                        }
                    });
                    return data;
                });

                const enrichedData = pageData.map(item => ({
                    ...item, warehouse_code: whCode, warehouse_name: whName
                }));
                allExtractedData.push(...enrichedData);

                const isNextDisabled = await page.$eval('#stock-data-table_next', el => el.classList.contains('disabled')).catch(() => true);
                if (!isNextDisabled) {
                    await page.click('#stock-data-table_next a');
                    await page.waitForTimeout(1500); 
                } else {
                    hasNextPage = false;
                }
            }
        }
        await browser.close();

        if (allExtractedData.length > 0) {
            console.log(`💾 Saving ${allExtractedData.length} records...`);
            await supabase.from('donor_warehouse_stock').delete().eq('stock_date', formattedDate);

            const dbPayload = allExtractedData.map(item => ({
                ...item, stock_date: formattedDate, fetch_date: new Date().toISOString()
            }));
            
            await supabase.from('donor_warehouse_stock').insert(dbPayload);
            console.log("✅ GitHub Actions Scrape Successful!");
        }
        process.exit(0); // কাজ শেষে স্ক্রিপ্ট বন্ধ করা
    } catch (error) {
        console.error("❌ GitHub Actions Failed:", error.message);
        if(browser) await browser.close();
        process.exit(1);
    }
}

runDailyScrape();
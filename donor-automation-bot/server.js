require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const browserOptions = { 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
};

// ==========================================
// API: PM2 লগ ফাইল রিড করা
// ==========================================
app.get('/api/logs', (req, res) => {
    try {
        // আপনার সার্ভারের নির্দিষ্ট ইউজারনেম অনুযায়ী পাথ
        // যদি লগ না আসে, তবে 'joti_on89' এর জায়গায় আপনার সার্ভারের ইউজারনেম দিতে হবে
        const logPath = path.join('/home/joti_on89/.pm2/logs/donor-bot-out.log'); 
        
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.trim().split('\n').slice(-150); 
            res.json({ success: true, logs: lines });
        } else {
            res.json({ success: true, logs: ["Log file not found at " + logPath] });
        }
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// কোর স্ক্র্যাপিং ফাংশন
// ==========================================
async function performScraping(targetDate) {
    console.log(`\n⚙️ [${new Date().toLocaleString()}] Starting Process for Date: ${targetDate}`);
    let browser;
    try {
        const { data: settings } = await supabase.from('automation_settings').select('*').single();
        if (!settings || !settings.donor_url) throw new Error("Settings not found.");

        const { data: mappings } = await supabase.from('warehouse_mappings').select('*');
        if (!mappings || mappings.length === 0) throw new Error("No warehouse mappings found.");

        console.log("🌐 Launching headless browser...");
        browser = await chromium.launch(browserOptions); 
        const context = await browser.newContext();
        const page = await context.newPage();

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

            console.log(`▶️ Processing WH: ${whCode}`);
            try {
                await page.selectOption('select[name="warehouse_id"]', whCode);
            } catch(e) {
                console.log(`⚠️ Code ${whCode} not found in dropdown. Skipping...`);
                continue;
            }

            await page.click('button:has-text("Search")');
            await page.waitForTimeout(2000); 

            try {
                const lengthSelect = await page.$('select[name="stock-data-table_length"]');
                if (lengthSelect) await page.selectOption('select[name="stock-data-table_length"]', '100');
                await page.waitForTimeout(1000);
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
                                // contingency_quantity রিমুভ করা হয়েছে
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
                    ...item,
                    warehouse_code: whCode,
                    warehouse_name: whName,
                    stock_date: targetDate,
                    fetch_date: new Date().toISOString()
                }));

                allExtractedData.push(...enrichedData);

                const isNextDisabled = await page.$eval('#stock-data-table_next', el => el.classList.contains('disabled')).catch(() => true);
                if (!isNextDisabled) {
                    await page.click('#stock-data-table_next a');
                    await page.waitForTimeout(1000); 
                } else {
                    hasNextPage = false;
                }
            }
        }
        await browser.close();

        if (allExtractedData.length > 0) {
            console.log(`💾 Scraped ${allExtractedData.length} items. Saving to DB...`);
            await supabase.from('donor_warehouse_stock').delete().eq('stock_date', targetDate);

            const { error: insertErr } = await supabase.from('donor_warehouse_stock').insert(allExtractedData);
            if (insertErr) throw new Error(`Supabase Insert Error: ${insertErr.message}`);

            console.log("✅ Successfully saved to Supabase!");
            return allExtractedData.length;
        } else {
            console.log("⚠️ No data was found on the page.");
            return 0;
        }
    } catch (error) {
        console.log(`❌ Script Error: ${error.message}`);
        if(browser) await browser.close();
        throw error;
    }
}

app.post('/api/manual-scrape', async (req, res) => {
    const { date } = req.body;
    if (!date) return res.status(400).json({ success: false, error: "Date is required." });
    try {
        const count = await performScraping(date);
        res.json({ success: true, count: count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/test-scrape', async (req, res) => {
    const targetWhCode = req.query.wh_code; 
    if (!targetWhCode) return res.status(400).json({ success: false, error: "Missing WH Code" });

    let browser;
    try {
        const { data: settings } = await supabase.from('automation_settings').select('*').single();
        if (!settings || !settings.donor_url) throw new Error("Settings not found.");

        const { data: mappings } = await supabase.from('warehouse_mappings').select('*');
        const targetMap = mappings ? mappings.find(m => m.donor_wh_code === targetWhCode) : null;
        const whName = targetMap ? targetMap.donor_wh_name : targetWhCode;

        console.log(`\n🧪 [Test] Fetching WH: ${targetWhCode}`);
        browser = await chromium.launch(browserOptions); 
        const context = await browser.newContext();
        const page = await context.newPage();

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

        await page.selectOption('select[name="warehouse_id"]', targetWhCode);
        await page.click('button:has-text("Search")');
        await page.waitForTimeout(2000); 

        try {
            const lengthSelect = await page.$('select[name="stock-data-table_length"]');
            if (lengthSelect) await page.selectOption('select[name="stock-data-table_length"]', '100');
            await page.waitForTimeout(1000);
        } catch(e) {}

        let allExtractedData = [];
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
                                unit: cols[3].innerText.trim(),
                                quantity: parseFloat(cols[4].innerText.replace(/,/g, '')) || 0
                                // contingency_quantity রিমুভ করা হয়েছে
                            });
                        }
                    }
                });
                return data;
            });

            const enrichedData = pageData.map(item => ({
                ...item, donor_warehouse_code: targetWhCode, warehouse_name: whName
            }));

            allExtractedData.push(...enrichedData);

            const isNextDisabled = await page.$eval('#stock-data-table_next', el => el.classList.contains('disabled')).catch(() => true);
            if (!isNextDisabled) {
                await page.click('#stock-data-table_next a');
                await page.waitForTimeout(1000); 
            } else {
                hasNextPage = false;
            }
        }

        await browser.close();
        console.log(`✅ Test Fetch Done! (${allExtractedData.length} records)`);
        res.json({ success: true, data: allExtractedData });
    } catch (error) {
        if(browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🤖 Automation API running on http://0.0.0.0:${PORT}`);
});
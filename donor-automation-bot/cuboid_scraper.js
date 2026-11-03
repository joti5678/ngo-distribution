require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function runAutomation() {
    console.log("🚀 Starting CUBOID Automation Bot...");

    try {
        // ১. ডাটাবেস থেকে সেটিংস আনা
        const { data: settings, error: settingErr } = await supabase.from('automation_settings').select('*').single();
        if (settingErr || !settings) throw new Error("Settings not found.");
        if (!settings.is_active) {
            console.log("⚠️ Automation is disabled in settings.");
            return;
        }

        const browser = await chromium.launch({ headless: false }); // টেস্ট করার জন্য false, গিটহাবে তোলার আগে true করে দেবেন
        const context = await browser.newContext();
        const page = await context.newPage();

        // ২. লগইন করা
        console.log("🌐 Navigating to login page...");
        await page.goto(settings.donor_url, { waitUntil: 'networkidle' });
        
        await page.fill('input[name="email"], #email', settings.donor_username); 
        await page.fill('input[name="password"], #password', settings.donor_password);
        await page.click('button[type="submit"]');

        await page.waitForNavigation({ waitUntil: 'networkidle' });
        console.log("✅ Login Successful!");

        // ৩. স্টক পেজে যাওয়া
        await page.goto('https://iwms.nanoit.biz/current-total-goods-stock-report', { waitUntil: 'networkidle' });

        // ৪. ফিল্টার সিলেক্ট করা (ACTED, NFI ইত্যাদি)
        await page.selectOption('select[name="sector_id"]', { label: 'NFI' });
        await page.waitForLoadState('networkidle');
        await page.selectOption('select[name="partner_id"]', { label: 'ACTED' });
        await page.waitForLoadState('networkidle');
        
        // নির্দিষ্ট ওয়্যারহাউজ সিলেক্ট (আপাতত একটি ডেমো ওয়্যারহাউজ দেওয়া হলো)
        const targetWhName = 'Acted WH _ RC, Kutupalong'; 
        const targetWhCode = 'RC-KTP'; // আপনার সিস্টেমের ওয়্যারহাউজ কোড
        
        await page.selectOption('select[name="warehouse_id"]', { label: targetWhName });
        await page.click('button:has-text("Search")');
        await page.waitForLoadState('networkidle');

        // ৫. ডাটা এক্সট্র্যাক্ট করা
        const extractedData = await page.evaluate((whCode) => {
            const data = [];
            const rows = document.querySelectorAll('table.table tbody tr'); 
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 6) {
                    const pCode = cols[1].innerText.trim();
                    const pName = cols[2].innerText.trim();
                    const qty = parseFloat(cols[4].innerText.replace(/,/g, '')) || 0;
                    if (pCode) {
                        data.push({ warehouse_code: whCode, product_code: pCode, product_name: pName, quantity: qty });
                    }
                }
            });
            return data;
        }, targetWhCode);

        console.log(`📦 Extracted ${extractedData.length} items.`);
        await browser.close();

        // ৬. ডাটাবেসে সেভ করা
        if (extractedData.length > 0) {
            let stockDate = new Date();
            if (settings.is_previous_day_stock) stockDate.setDate(stockDate.getDate() - 1);
            const formattedDate = stockDate.toISOString().split('T')[0];

            await supabase.from('donor_warehouse_stock').delete().eq('stock_date', formattedDate).eq('warehouse_code', targetWhCode);

            const dbPayload = extractedData.map(item => ({ ...item, stock_date: formattedDate }));
            await supabase.from('donor_warehouse_stock').insert(dbPayload);

            console.log("✅ Data successfully saved to Supabase!");
        }

    } catch (error) {
        console.error("❌ Automation Failed:", error.message);
    }
}

runAutomation();
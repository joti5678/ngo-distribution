require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// ১. Supabase কানেকশন
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function runAutomation() {
    console.log("🚀 Starting Donor Automation Bot...");

    try {
        // ২. ডাটাবেস থেকে সেটিংস এবং আইডি/পাসওয়ার্ড নিয়ে আসা
        const { data: settings, error: settingErr } = await supabase
            .from('automation_settings')
            .select('*')
            .single();

        if (settingErr || !settings) {
            throw new Error("Settings not found in database.");
        }

        if (!settings.is_active) {
            console.log("⚠️ Automation is currently disabled in settings. Exiting...");
            return;
        }

        console.log(`🌐 Target URL: ${settings.donor_url}`);

        // ৩. ব্রাউজার চালু করা (Headless Mode)
        // ব্রাউজারটি স্ক্রিনে দেখতে চাইলে headless: false করে দেবেন
        const browser = await chromium.launch({ headless: true }); 
        const context = await browser.newContext();
        const page = await context.newPage();

        // ৪. লগইন পেজে যাওয়া এবং লগইন করা
        await page.goto(settings.donor_url, { waitUntil: 'networkidle' });

        console.log("🔑 Logging into the external system...");
        
        // **[গুরুত্বপূর্ণ]** নিচের সিলেক্টরগুলো (#username, #password) ডোনারের ওয়েবসাইট অনুযায়ী পরিবর্তন করতে হবে
        await page.fill('input[name="username"], #username, #email', settings.donor_username);
        await page.fill('input[name="password"], #password', settings.donor_password);
        await page.click('button[type="submit"], #login-btn');

        // লগইন হওয়ার পর ড্যাশবোর্ড বা স্টক পেজ লোড হওয়া পর্যন্ত অপেক্ষা করা
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        console.log("✅ Login Successful!");

        // ৫. স্টক পেজ থেকে ডাটা এক্সট্র্যাক্ট করা (Scraping)
        // **[গুরুত্বপূর্ণ]** ওয়েবসাইটের HTML স্ট্রাকচার অনুযায়ী এই অংশটুকু কাস্টমাইজ করতে হবে
        console.log("📥 Fetching stock data...");
        
        const extractedData = await page.evaluate(() => {
            const stockItems = [];
            // ধরুন, ওয়েবসাইটের ডাটাগুলো একটি <table> এর ভেতরে আছে
            const rows = document.querySelectorAll('table tbody tr'); 

            rows.forEach(row => {
                const whCode = row.getAttribute('data-warehouse-code') || 'WH-DEFAULT'; // HTML Attribute থেকে ওয়্যারহাউজ কোড
                const whName = row.querySelector('.warehouse-name')?.innerText || 'Default WH';
                const pCode = row.querySelector('.product-code')?.innerText || '';
                const pName = row.querySelector('.product-name')?.innerText || '';
                const qtyText = row.querySelector('.quantity')?.innerText || '0';
                
                const quantity = parseInt(qtyText.replace(/[^0-9]/g, ''), 10);

                if (pCode && !isNaN(quantity)) {
                    stockItems.push({
                        warehouse_code: whCode,
                        warehouse_name: whName,
                        product_code: pCode.trim(),
                        product_name: pName.trim(),
                        quantity: quantity
                    });
                }
            });
            return stockItems;
        });

        console.log(`📦 Found ${extractedData.length} products in external system.`);
        await browser.close();

        // ৬. ডাটাબેসে সেভ করার তারিখ নির্ধারণ (Previous Day Logic)
        let stockDate = new Date();
        if (settings.is_previous_day_stock) {
            stockDate.setDate(stockDate.getDate() - 1); // আগের দিনের তারিখ
        }
        const formattedStockDate = stockDate.toISOString().split('T')[0];

        // ৭. আগের ডাটা ডিলিট করে নতুন ডাটা সেভ করা (যাতে ডাবল এন্ট্রি না হয়)
        if (extractedData.length > 0) {
            console.log(`💾 Saving data for stock date: ${formattedStockDate}`);
            
            // আজকের তারিখের আগের ডাটা মুছে ফেলা (Overwriting)
            await supabase.from('donor_warehouse_stock')
                .delete()
                .eq('stock_date', formattedStockDate);

            // নতুন ডাটাবেস অবজেক্ট তৈরি
            const dbPayload = extractedData.map(item => ({
                ...item,
                stock_date: formattedStockDate,
                fetch_date: new Date().toISOString()
            }));

            const { error: insertErr } = await supabase.from('donor_warehouse_stock').insert(dbPayload);
            
            if (insertErr) throw insertErr;
            
            console.log("✅ Data successfully saved to Supabase!");

            // ৮. লগ টেবিলে সাকসেস মেসেজ রাখা
            await supabase.from('automation_logs').insert([{
                trigger_type: 'AUTO',
                target_date: formattedStockDate,
                records_fetched: extractedData.length,
                status: 'SUCCESS'
            }]);
        }

    } catch (error) {
        console.error("❌ Automation Failed:", error.message);
        
        // লগ টেবিলে ফেইল্ড মেসেজ রাখা
        await supabase.from('automation_logs').insert([{
            trigger_type: 'AUTO',
            target_date: new Date().toISOString().split('T')[0],
            status: 'FAILED',
            error_message: error.message
        }]);
    }
}

// স্ক্রিপ্টটি রান করা
runAutomation();
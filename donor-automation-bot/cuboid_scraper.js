const { chromium } = require('playwright');

async function scrapeCUBOID() {
    console.log("🚀 Starting CUBOID Automation Bot...");
    const browser = await chromium.launch({ headless: false }); // Set to true in production
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log("🌐 Navigating to login page...");
        await page.goto('https://iwms.nanoit.biz/login', { waitUntil: 'networkidle' }); // Adjust login URL if different

        // --- 1. Login ---
        console.log("🔑 Logging in...");
        // You will need to replace these selectors with the actual ones from the login page
        await page.fill('input[name="email"]', 'your_email@acted.org'); // Example selector
        await page.fill('input[name="password"]', 'your_password');     // Example selector
        await page.click('button[type="submit"]');                      // Example selector

        await page.waitForNavigation({ waitUntil: 'networkidle' });
        console.log("✅ Login Successful!");

        // --- 2. Navigate to Stock Report ---
        console.log("📂 Navigating to Stock Report page...");
        await page.goto('https://iwms.nanoit.biz/current-total-goods-stock-report', { waitUntil: 'networkidle' });

        // --- 3. Filter Selection ---
        console.log("🔍 Setting filters...");

        // Select 'Sector Wise Stock' radio button (if not already selected)
        // await page.click('input[value="sector_wise"]'); // Adjust selector if needed

        // Select Sector 'NFI'
        await page.selectOption('select[name="sector_id"]', { label: 'NFI' }); // Adjust selector based on actual HTML
        await page.waitForLoadState('networkidle');

        // Select Partner Agency 'ACTED'
        await page.selectOption('select[name="partner_id"]', { label: 'ACTED' }); // Adjust selector based on actual HTML
        await page.waitForLoadState('networkidle');

        // Select Warehouse (Iterate through warehouses later, picking one for now)
        const warehouseToSelect = 'Acted WH _ RC, Kutupalong';
        await page.selectOption('select[name="warehouse_id"]', { label: warehouseToSelect }); // Adjust selector based on actual HTML

        // Click Search
        await page.click('button:has-text("Search")');
        await page.waitForLoadState('networkidle');
        console.log("✅ Filters applied.");

        // --- 4. Extract Data ---
        console.log("📥 Extracting data from table...");

        // Wait for the table to appear
        await page.waitForSelector('table.table'); // Adjust selector based on actual table class/id

        // Increase entries shown to max if pagination exists (Optional but recommended)
        // await page.selectOption('select[name="DataTables_Table_0_length"]', '-1'); 

        const extractedData = await page.evaluate(() => {
            const data = [];
            // Select all rows inside the table body
            const rows = document.querySelectorAll('table.table tbody tr'); 

            rows.forEach(row => {
                const columns = row.querySelectorAll('td');
                if (columns.length >= 6) { // Ensure it's a data row
                    const goodsCode = columns[1].innerText.trim();
                    const goodsInformation = columns[2].innerText.trim();
                    const unit = columns[3].innerText.trim();
                    const availableRegularGoods = parseFloat(columns[4].innerText.replace(/,/g, '')) || 0;
                    // Contingency goods are in column 5, but usually we just want regular or total. 
                    // Adjust logic if you need to sum them.

                    if (goodsCode) {
                        data.push({
                            product_code: goodsCode,
                            product_name: goodsInformation,
                            quantity: availableRegularGoods // Using regular goods for now
                        });
                    }
                }
            });
            return data;
        });

        console.log(`📦 Successfully extracted ${extractedData.length} items.`);
        console.log(extractedData.slice(0, 3)); // Print first 3 for verification

        // In a real scenario, you would map 'warehouseToSelect' to your internal 'warehouse_code'
        // and push 'extractedData' to Supabase.

    } catch (error) {
        console.error("❌ Automation Failed:", error);
    } finally {
        await browser.close();
        console.log("🛑 Browser closed.");
    }
}

// scrapeCUBOID(); // Uncomment to run locally if dependencies were installed
print("Playwright script structure created based on screenshots.")

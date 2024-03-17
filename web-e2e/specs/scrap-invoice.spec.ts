import { test, Page, expect } from '@playwright/test';

test("Login into Cheap Connect and Verify the Cheap Connect Hyperlink", async ({ page }) => {

        // Navigate to Cheap Connect Page
        await page.goto(`https://account.cheapconnect.net/invoices.php`);
        await page.waitForURL(`https://account.cheapconnect.net/invoices.php`);

        // Wait for DOM Content to be Loaded and Verify Cheap Connect Hyperlink
        await page.waitForLoadState(`domcontentloaded`);
        await expect(page.locator(`//a[@href='index.php']`)).toBeVisible({ visible: true});

        // Login in to Cheap Connect
        await page.locator(`//input[@id='username']`).fill('info@techpreneur.nl');
        await page.locator(`//input[@id='password']`).fill('Developer!2024');
        await page.locator(`//button[@id='logindiv']`).click();

        // Verify that the user is redirected to the desired page
        await expect(page.locator(`//a[@href='index.php']`)).toBeVisible({ visible: true});
        await expect(page.locator(`//div[@id='datatable-invoices_wrapper']`)).toBeVisible({ visible: true});

        const downloadInvoiceData={
                page,
                downloadAllInvoices: true
        }
        await downloadInvoices(downloadInvoiceData);
});

type downloadInvoiceArgs = {
        page: Page;
        downloadAllInvoices: boolean;
};


async function downloadInvoices({ page,downloadAllInvoices }: downloadInvoiceArgs):Promise<void> {

        if (downloadAllInvoices === true) {
                const downloadAllInvoiceOnTable = await page.$$(`//a[normalize-space()='Download']`);
                for (const downloadInvoice of downloadAllInvoiceOnTable) {
                        const [download] = await Promise.all([
                         page.waitForEvent('download'),
                        await downloadInvoice.click({ force: true})
                        ]);

                        const path = await download.path();
                        console.log(path);

                        const downloadFolderPath = __dirname + `\\utils`;
                        await download.saveAs(downloadFolderPath + download.suggestedFilename());
                        }
                        await page.waitForTimeout(2000);
                }
                console.log('All items have been Downloaded,');
        }
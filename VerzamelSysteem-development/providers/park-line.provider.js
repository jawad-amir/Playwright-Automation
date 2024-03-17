const fs = require('fs/promises');
const { parse } = require('date-fns');
const Provider = require('./provider');

class ParkLineProvider extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'Park-line';

  /**
   * @private
   * @type {string}
   */
  authUrl = 'https://mijn.park-line.nl/Epms/ClientPages/default.aspx';

  /**
   * @private
   * @type {string}
   */
  invoiceUrl = 'https://mijn.park-line.nl/Epms/ClientPages/client/client_invoices.aspx';

  /**
   * @private
   * @type {boolean}
   */
  authDone = false;

  /**
   * @public
   * @return {Promise<{date: *, download: *, website: *, description: *}[] | { error: String }>}
   */
  async fetch() {
    if (!this.authDone) {
      try {
        await this.authenticate();
      } catch (err) {
        throw new Error('authenticationFailed');
      }
    }
    try {
      const invoiceList = await this.getInvoiceList();
      // eslint-disable-next-line max-len
      const invoiceListFiltered = this.applyFilters(invoiceList.filter((value) => value !== undefined));
      // Use a Set to track the descriptions we have seen so far
      const seenDescriptions = new Set();
      // eslint-disable-next-line no-unused-vars
      const invoices = invoiceListFiltered.filter((obj, index, self) => {
        // Convert description property to string to handle numeric duplicates
        const descriptionStr = obj.description.toString();
        if (!seenDescriptions.has(descriptionStr)) {
          seenDescriptions.add(descriptionStr);
          return true;
        }
        return false;
      });
      return await Promise.all(invoices.map(async (invoice) => {
        const download = await this.getDownload(invoice.href);

        this.updateFetchStatus(invoiceList.length);
        return {
          ...invoice,
          date: this.formatDate(invoice.date),
          download,
          fileName: invoice.description,
        };
      }));
    } catch (err) {
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @param {String} date
   * @return {Date}
   */
  parseDate(date) {
    return parse(date, 'd-M-yyyy', new Date());
  }

  /**
   * @private
   * @return {Promise<Awaited<{date: *, download: *, website: *, description: *}>[]>}
   */
  async getInvoiceList() {
    try {
      await this.page.goto(this.invoiceUrl);

      const invoices = [];
      while (true) {
        const invoiceHandles = await this.page.$$('table.rgMasterTable tbody tr');

        for (const invoiceHandle of invoiceHandles) {
          const description = await this.getDescription(invoiceHandle);
          const date = await this.getDate(invoiceHandle);
          const href = await this.getHref(invoiceHandle);
          if (description != null) {
            invoices.push({
              description, href, date: this.parseDate(date), wsName: this.ws.name,
            });
          }
        }

        const nextPageButton = await this.page.$('input.rgPageNext');
        const onClickValue = await nextPageButton.getAttribute('onclick');
        if (onClickValue !== null) {
          break;
        }
        await nextPageButton.click();
        await this.page.waitForSelector('table.rgMasterTable');
      }
      this.onSuccess('Collect invoice list complete', invoices);
      return invoices;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @param {import('playwright-core').ElementHandle} invoiceHandle
   * @return {Promise<string>}
   */
  async getDescription(invoiceHandle) {
    const descriptionHandle = await invoiceHandle.$('a.link');
    return descriptionHandle && descriptionHandle.innerText();
  }

  /**
   * @private
   * @param {import('playwright-core').ElementHandle} invoiceHandle
   * @return {Promise<string>}
   */
  async getHref(invoiceHandle) {
    const descriptionHandle = await invoiceHandle.$('a.link');
    try {
      const hrefAttribute = await descriptionHandle.getAttribute('href');

      const realLink = new URL(hrefAttribute, this.page.url()).href;

      return descriptionHandle && realLink;
    } catch (err) {
      return descriptionHandle && descriptionHandle.getAttribute('href');
    }
  }

  /**
   * @private
   * @param {import('playwright-core').ElementHandle} invoiceHandle
   * @return {Promise<string>}
   */
  // eslint-disable-next-line consistent-return
  async getDate(invoiceHandle) {
    try {
      const date = await invoiceHandle.$eval('td:nth-child(6)', (td) => (td ? td.textContent.trim() : null));
      return date && date;
    } catch (err) {
      // do nothing
    }
  }

  /**
   * @private
   * @param {{ href: String }} href
   * @return {Promise<import('playwright-core').Download>}
   */
  async getDownload(href) {
    const ctx = this.page.context();
    const page = await ctx.newPage();
    try {
      await page.goto('https://techpreneur.nl/verzamelsysteem/fetching.html');
      const downloadPromise = page.waitForEvent('download');
      await page.evaluate((url) => {
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.click();
      }, href);
      const download = await downloadPromise;
      const downloadPath = await download.path();

      const arrayBuffer = await fs.readFile(downloadPath);
      await fs.unlink(downloadPath);
      await page.close();
      this.onSuccess('PDF prefetch complete', { href });
      return {
        buffer: Buffer.from(arrayBuffer),
        async saveAs(path) {
          await fs.writeFile(path, this.buffer);
        },
      };
    } catch (err) {
      await this.onPageError(err, page);
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @return {Promise<void>}
   */
  async authenticate() {
    try {
      await this.page.goto(this.authUrl);
      await this.page.locator('input[type=text]').fill(this.ws.username);
      await this.page.locator('input[type=password]').fill(this.ws.password);
      await this.page.locator('input[type=button]').click();
      const invalid = await this.page.$('span#ctl00_cphMain_UcUserLoginControl1_lbErrorMessage');
      if (invalid) throw new Error('Auth failed');
      await this.page.waitForURL('https://mijn.park-line.nl/Epms/ClientPages/announcement/announcements.aspx');
      this.onSuccess('Authentication complete');
      this.authDone = true;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('authenticationFailed');
    }
  }
}

module.exports = ParkLineProvider;

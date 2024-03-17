const { isBefore } = require('date-fns');
const Provider = require('./provider');

class DigitalOceanProvider extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'Digital Ocean';

  /**
   * @private
   * @type {string}
   */
  authUrl = 'https://cloud.digitalocean.com/login';

  /**
   * @private
   * @type {string}
   */
  invoiceUrl = 'https://cloud.digitalocean.com/account/billing';

  /**
   * @private
   * @type {boolean}
   */
  authDone = false;

  /**
   * @private
   * @type {boolean}
   */
  requires2FA = true;

  /**
   * @private
   * @type {number}
   */
  fetchCount = 0;

  /**
   * @public
   * @param {String} code
   * @return {Promise<Awaited<{date: *, download: *, fileName: *, description: *}>[]>}
   */
  async fetch(code) {
    await this.handle2FA(code);
    try {
      const customerId = await this.getCustomerId();
      const results = [];
      let next = `https://cloud.digitalocean.com/v2/customers/${customerId}/billing_history?page=1&per_page=20`;
      let filteredOut = false;
      do {
        const billingHistoryPage = await this.getBillingHistoryPage(next);
        const invoiceList = this.getInvoiceList(billingHistoryPage);
        const invoiceListFiltered = this.applyFilters(invoiceList);
        await Promise.all(invoiceListFiltered.map(async (invoice) => {
          const link = this.getDownloadLink(customerId, invoice.invoice_uuid);
          const download = await this.getDownload(link);
          results.push({
            date: this.formatDate(invoice.date),
            description: invoice.description,
            download,
            fileName: download.suggestedFilename(),
            wsName: this.ws.name,
          });
        }));
        this.updateFetchStatus(this.getTotal(billingHistoryPage));
        next = this.getNextPageLink(billingHistoryPage);
        filteredOut = this.getFilteredOut(invoiceList);
      } while (next && !filteredOut);
      return results.filter((item) => !item.fileName.includes('.json'));
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
    return new Date(date);
  }

  /**
   * @private
   * @param {{ links: { pages: { next: String }}}} billingHistoryPage
   * @return String
   */
  getNextPageLink(billingHistoryPage) {
    if (!billingHistoryPage?.links?.pages?.next) return null;
    return decodeURI(billingHistoryPage.links.pages.next);
  }

  /**
   * @private
   * @param {{ meta: { total: Number }}} billingHistoryPage
   * @return Number
   */
  getTotal(billingHistoryPage) {
    if (!billingHistoryPage?.links?.pages?.next) return 0;
    return billingHistoryPage.meta.total;
  }

  /**
   * @private
   * @param {String} next
   * @return {Promise<{}|any>}
   */
  async getBillingHistoryPage(next) {
    await this.page.goto(next.replace('api.digitalocean.com', 'cloud.digitalocean.com'));
    const dataStr = await this.page.locator('body').textContent();
    try {
      const data = JSON.parse(dataStr);
      this.onSuccess('Collect billing data complete', { data });
      return data;
    } catch (err) {
      await this.onPageError(err, this.page);
      return {};
    }
  }

  /**
   * @private
   * @param {String} link
   * @return {Promise<import('playwright-core').Download>}
   */
  async getDownload(link) {
    try {
      const ctx = this.page.context();
      const page = await ctx.newPage();
      await page.goto('https://techpreneur.nl/verzamelsysteem/fetching.html');
      const downloadPromise = page.waitForEvent('download');
      await page.evaluate((href) => {
        const linkEl = document.createElement('a');
        linkEl.setAttribute('href', href);
        linkEl.setAttribute('id', 'my-invoice');
        linkEl.setAttribute('style', 'display:inline-block;width:1px;height:1px;');
        document.body.append(linkEl);
      }, link);
      await page.locator('#my-invoice').click({ modifiers: ['Alt'] });
      const download = await downloadPromise;
      await download.path();
      await page.close();
      this.onSuccess('PDF prefetch complete', { link });
      return download;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @param {{ date: Date, description: String, invoice_uuid: String }[]} invoiceList
   * @return {Boolean}
   */
  getFilteredOut(invoiceList) {
    if (!this.filters?.from) return false;
    const from = new Date(this.filters.from);
    return invoiceList.some((invoice) => isBefore(invoice.date, from));
  }

  /**
   * @private
   * @param {{ billing_history: Object[] }} billingHistoryPage
   * @return {{ date: Date, description: String, invoice_uuid: String }[]}
   */
  getInvoiceList(billingHistoryPage) {
    if (!billingHistoryPage?.billing_history) return [];
    return billingHistoryPage.billing_history
      .filter((item) => item.type === 'Invoice')
      .map((item) => ({ ...item, date: this.parseDate(item.date) }));
  }

  /**
   * @private
   * @return {Promise<string|null>}
   */
  async getCustomerId() {
    const requestPromise = this.page.waitForEvent('request', {
      predicate: (req) => req.url().includes('customers') && req.url().includes('invoices'),
    });
    await this.page.goto(this.invoiceUrl);
    const req = await requestPromise;
    const matches = req.url().match(/customers\/([0-9a-z]*)\/invoices/);
    return (matches && matches[1]) || null;
  }

  /**
   * @private
   * @param {String} customerId
   * @param {String} invoiceId
   * @return {String}
   */
  getDownloadLink(customerId, invoiceId) {
    return `https://cloud.digitalocean.com/v2/customers/${customerId}/invoices/${invoiceId}/pdf`;
  }

  /**
   * @private
   * @param {String} code
   * @return {Promise<void>}
   */
  async handle2FA(code) {
    try {
      await this.page.locator('#code').fill(code);
      await this.page.getByRole('button', { name: 'Verify Code' }).click();
      const invalid = await this.page.getByText('Incorrect code').isVisible();
      if (invalid) throw new Error('Auth failed');
      await this.page.waitForURL('https://cloud.digitalocean.com/projects');
      this.onSuccess('2FA Complete');
      this.authDone = true;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('authenticationFailed');
    }
  }

  /**
   * @public
   * @return {Promise<Function>}
   */
  async authenticate() {
    try {
      await this.page.goto(this.authUrl);
      await this.page.locator('#email').fill(this.ws.username);
      await this.page.locator('#password').fill(this.ws.password);
      await this.page.getByRole('button', { name: 'Log In' }).click();
      const invalid = await this.page.getByText('Incorrect email or password').isVisible();
      if (invalid) throw new Error('Auth failed');
      await this.page.waitForSelector('#code');
      this.onSuccess('Authentication complete');
      return this.fetch.bind(this);
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('authenticationFailed');
    }
  }
}

module.exports = DigitalOceanProvider;

const { parse } = require('date-fns');
const Provider = require('./provider');

class CloudwaysProvider extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'Cloudways';

  /**
   * @private
   * @type {string}
   */
  authUrl = 'https://platform.cloudways.com/login';

  /**
   * @private
   * @type {string}
   */
  invoiceUrl = 'https://platform.cloudways.com/account/invoice';

  /**
   * @private
   * @type {boolean}
   */
  authDone = false;

  /**
   * @private
   * @type {number}
   */
  fetchCount = 0;

  /**
   * @public
   * @return {Promise<{date: *, download: *, website: *, description: *}[] | { error: String }>}
   */
  async fetch() {
    if (!this.authDone) {
      await this.authenticate();
    }
    const invoiceList = await this.getInvoiceList();
    const invoiceListFiltered = this.applyFilters(invoiceList);
    try {
      return Promise.all(invoiceListFiltered.map(async (invoice) => {
        const download = await this.getDownload(invoice);
        this.updateFetchStatus(invoiceList.length);
        return {
          ...invoice,
          date: this.formatDate(invoice.date),
          download,
          fileName: download.suggestedFilename(),
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
    return parse(date, 'MMM d, yyyy', new Date());
  }

  /**
   * @private
   * @return {Promise<Awaited<{date: *, download: *, website: *, description: *}>[]>}
   */
  async getInvoiceList() {
    try {
      await this.page.goto(this.invoiceUrl);
      await this.page.waitForSelector('h3:text("MY INVOICES")');
      const invoiceHandles = await this.page.$$('section.ma-invoice .srv-app-tbl-content');
      const invoiceList = Promise.all(invoiceHandles.map(async (invoiceHandle) => {
        const description = await this.getDescription(invoiceHandle);
        const date = await this.getDate(invoiceHandle);
        const href = await this.getHref(invoiceHandle);
        return {
          description, href, date: this.parseDate(date), wsName: this.ws.name,
        };
      }));
      this.onSuccess('Collect invoice list complete', invoiceList);
      return invoiceList;
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
    const descriptionHandle = await invoiceHandle.$('a.glb-link');
    return descriptionHandle && descriptionHandle.innerText();
  }

  /**
   * @private
   * @param {import('playwright-core').ElementHandle} invoiceHandle
   * @return {Promise<string>}
   */
  async getHref(invoiceHandle) {
    const descriptionHandle = await invoiceHandle.$('a.glb-link');
    return descriptionHandle && descriptionHandle.getAttribute('href');
  }

  /**
   * @private
   * @param {import('playwright-core').ElementHandle} invoiceHandle
   * @return {Promise<string>}
   */
  async getDate(invoiceHandle) {
    const dateHandle = await invoiceHandle.$(this.getDateSelector());
    return dateHandle && dateHandle.innerText();
  }

  /**
   * @private
   * @return {string}
   */
  getDateSelector() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.reduce((accumulator, month, i) => {
      if (i === months.length - 1) {
        return accumulator.concat(`:text("${month}"))`);
      }
      return accumulator.concat(`:text("${month}"), `);
    }, 'span:is(');
  }

  /**
   * @private
   * @param {{ href: String }} invoice
   * @return {Promise<import('playwright-core').Download>}
   */
  async getDownload(invoice) {
    const ctx = this.page.context();
    const page = await ctx.newPage();
    try {
      await page.goto('https://techpreneur.nl/verzamelsysteem/fetching.html');
      const downloadPromise = page.waitForEvent('download');
      await page.evaluate((href) => {
        const link = document.createElement('a');
        link.setAttribute('href', `https://platform.cloudways.com${href}`);
        link.click();
      }, invoice.href);
      const download = await downloadPromise;
      await download.path();
      await page.close();
      this.onSuccess('PDF prefetch complete', { invoice });
      return download;
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
      await this.page.getByRole('textbox', { name: 'email' }).fill(this.ws.username);
      await this.page.getByRole('textbox', { name: 'password' }).fill(this.ws.password);
      await this.page.getByText('LOGIN NOW').click();
      const invalid = await this.page.getByText('Invalid email or password').isVisible();
      if (invalid) throw new Error('Auth failed');
      await this.page.waitForURL('https://platform.cloudways.com/server');
      this.onSuccess('Authentication complete');
      this.authDone = true;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('authenticationFailed');
    }
  }
}

module.exports = CloudwaysProvider;

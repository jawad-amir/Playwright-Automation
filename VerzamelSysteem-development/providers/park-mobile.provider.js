const fs = require('fs/promises');
const Provider = require('./provider');

class Parkmobile extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'Parkmobile';

  /**
   * @private
   * @type {string}
   */
  authUrl = 'https://account.parkmobile.com/login';

  /**
   * @private
   * @type {string}
   */
  baseUrl = 'https://nl.parkmobile.com/api';

  /**
   * @private
   * @type {boolean}
   */
  authDone = false;

  /**
   * @private
   * @type {number}
   */
  count = 0;

  /**
   * @public
   * @return {Promise<{ download: *, website: *, description: *}[] | { error: String }>}
   */
  async fetch() {
    const token = await this.authenticate();
    const invoiceList = await this.getInvoiceList(token);
    const invoiceListNormalized = this.normalizeInvoiceList(invoiceList);
    const invoiceListFiltered = this.applyFilters(invoiceListNormalized);
    try {
      return Promise.all(invoiceListFiltered.map(async (invoice, i) => {
        const download = await this.getDownload(invoice.link, token);
        this.updateFetchStatus(invoiceList.length);
        return {
          ...invoice,
          date: this.formatDate(invoice.date),
          download,
          fileName: invoiceList[i].invoiceId.toString(),
        };
      }));
    } catch (err) {
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @param {string} token
   * @return {Promise<{invoiceId:string,generationDate:string,documentUrl:string,title:string}[]>}
   */
  async getInvoiceList(token) {
    const response = await fetch(`${this.baseUrl}/account/invoices/1/1000`, {
      method: 'GET',
      headers: { Pmauthenticationtoken: token },
    });
    if (response.ok) {
      const data = await response.json();
      const invoices = data?.invoices || [];
      this.onSuccess('Collect invoice list complete', invoices);
      return invoices;
    }
    this.onError(new Error(`${this.baseUrl}/account/invoices/1/1000 Request failed. Status ${response.statusText}`));
    throw new Error('failedToFetchInvoicesFromWebsite');
  }

  /**
   * @private
   * @param {{invoiceId:string,generationDate:string,documentUrl:string,title:string}[]} invoiceList
   * @return {{description: String, date: Date, link: String, wsName: String}[]}
   */
  normalizeInvoiceList(invoiceList) {
    return invoiceList.map((invoice) => ({
      description: invoice.title,
      date: new Date(invoice.generationDate),
      link: `${this.baseUrl}${invoice.documentUrl}`,
      wsName: this.ws.name,
    }));
  }

  /**
   * @private
   * @param {String} link
   * @param {String} token
   * @return {Object}
   */
  async getDownload(link, token) {
    const response = await fetch(link, {
      method: 'GET',
      headers: { Pmauthenticationtoken: token },
    });
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      this.onSuccess('PDF prefetch complete', { link });
      return {
        buffer: Buffer.from(arrayBuffer),
        async saveAs(path) {
          await fs.writeFile(path, this.buffer);
        },
      };
    }
    this.onError(new Error(`${link} Request failed. Status ${response.statusText}`));
    throw new Error('failedToFetchInvoicesFromWebsite');
  }

  /**
   * @private
   * @return {Promise<string>}
   */
  async authenticate() {
    let token;
    try {
      await this.page.goto(this.authUrl);
      await this.page.locator('#username').fill(this.ws.username);
      await this.page.locator('#login_password').fill(this.ws.password);
      await this.page.locator('button[type=submit]').click();
      await this.page.waitForRequest(async (req) => {
        if (!req.url().includes('https://nl.parkmobile.com/api/account/identify')) return false;
        token = await req.headerValue('Pmauthenticationtoken');
        this.onSuccess('Authentication complete');
        this.authDone = true;
        return true;
      });
      return token;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('authenticationFailed');
    }
  }
}

module.exports = Parkmobile;

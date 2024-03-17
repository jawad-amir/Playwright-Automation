const { parse } = require('date-fns');
const fs = require('fs/promises');
const Provider = require('./provider');

class GoogleAdsProvider extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'Google Ads';

  /**
   * @private
   * @type {string}
   */
  clientId = '955658714327-7rr7rb5cm7o3kj4oot2m00ibum0jesr9.apps.googleusercontent.com';

  /**
   * @private
   * @type {string}
   */
  clientSecret = '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';

  /**
   * @private
   * @type {string}
   */
  developerToken = 'CF6dfz209y8Hu9Y63LWtcQ';

  /**
   * @private
   * @type {string}
   */
  authUrl = 'https://www.googleapis.com/oauth2/v3/token';

  /**
   * @private
   * @type {string}
   */
  baseUrl = 'https://googleads.googleapis.com/v14/customers';

  /**
   * @private
   * @type {number}
   */
  fetchCount = 0;

  async fetch() {
    const accessToken = await this.getAccessToken();
    const invoiceList = await this.getInvoiceList(accessToken);
    const normalizedInvoiceList = this.normalizeInvoiceList(invoiceList);
    const invoiceListFiltered = this.applyFilters(normalizedInvoiceList);
    try {
      return Promise.all(invoiceListFiltered.map(async (invoice) => {
        const download = await this.getDownload(invoice.link, accessToken);
        this.updateFetchStatus(invoiceList.length);
        return {
          ...invoice,
          date: this.formatDate(invoice.date),
          download,
          fileName: `${invoice.description}.pdf`,
        };
      }));
    } catch (err) {
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  async getAccessToken() {
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('client_id', this.clientId);
    body.append('client_secret', this.clientSecret);
    body.append('refresh_token', this.ws.password);
    const response = await fetch(this.authUrl, { method: 'POST', body });
    if (response.ok) {
      const data = await response.json();
      const token = data.access_token;
      this.onSuccess('Authentication complete', { token });
      return token;
    }
    this.onError(new Error(`${this.authUrl} Request failed. Status ${response.statusText}`));
    throw new Error('authenticationFailed');
  }

  /**
   * @private
   * @param {string} accessToken
   * @return {Promise<{issueDate: String, id: String, pdfUrl: String}[]>}
   */
  async getInvoiceList(accessToken) {
    const customerId = this.ws.username.replace(/-/g, '');
    const response = await fetch(`${this.baseUrl}/${customerId}/invoices`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.developerToken,
      },
    });
    if (response.ok) {
      const data = await response.json();
      const invoices = data?.invoices || [];
      this.onSuccess('Collect invoice list complete', invoices);
      return invoices;
    }
    this.onError(new Error(`${this.baseUrl}/${customerId}/invoices Request failed. Status ${response.statusText}`));
    throw new Error('failedToFetchInvoicesFromWebsite');
  }

  /**
   * @private
   * @param {String} date
   * @return {Date}
   */
  parseDate(date) {
    return parse(date, 'yyyy-MM-dd', new Date());
  }

  /**
   * @private
   * @param {{issueDate: String, id: String, pdfUrl: String}[]} invoiceList
   * @return {{description: String, date: Date, link: String, wsName: String}[]}
   */
  normalizeInvoiceList(invoiceList) {
    return invoiceList.map((invoice) => ({
      description: invoice.id,
      date: this.parseDate(invoice.issueDate),
      link: invoice.pdfUrl,
      wsName: this.ws.name,
    }));
  }

  /**
   * @private
   * @param {String} link
   * @param {String} accessToken
   * @return {Object}
   */
  async getDownload(link, accessToken) {
    const response = await fetch(link, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.developerToken,
      },
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
}

module.exports = GoogleAdsProvider;

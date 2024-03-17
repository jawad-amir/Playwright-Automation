const fs = require('fs/promises');
const Provider = require('./provider');

class MoneybirdPortalProvider extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'Moneybird - Portal';

  /**
   * @private
   * @type {string}
   */
  authUrl = this.ws.username;

  /**
   * @private
   * @type {string}
   */
  invoiceUrl = this.ws.username;

  /**
   * @private
   * @type {boolean}
   */
  authDone = false;

  /**
   * @private
   * @type {boolean}
   */
  requires2FA = false;

  /**
   * @private
   * @type {number}
   */
  fetchCount = 0;

  /**
   * @private
   * @return {Promise<boolean>}
   */
  async authenticate() {
    await this.page.goto(this.authUrl);
    await this.page.type('input[type="password"]', this.ws.password);
    await this.page.click('button[type="submit"]');

    await new Promise((resolve) => { setTimeout(resolve, 3000); });

    return this.page.evaluate(() => {
      const elements = document.querySelectorAll('span.form-input__message-text');
      let isAuthenticated = true;
      elements.forEach((e) => {
        if (e.textContent.trim() === 'Toegangscode niet correct') {
          isAuthenticated = false;
        }
      });
      return isAuthenticated;
    }).catch((e) => true);
  }

  /**
   * @private
   * @param {string} token
   * @return {Promise<{description:string,date:Date,link:string}[]>}
   */
  async getListOfInvoices() {
    const list = [];

    await new Promise((resolve) => { setTimeout(resolve, 1000); });

    await this.page.evaluate(() => document.querySelectorAll('a.invoice-nav-el')
      .forEach((e) => {
        if (e.textContent.trim() === 'Alle facturen') {
          e.click();
        }
      }));

    await new Promise((resolve) => { setTimeout(resolve, 2000); });
    const tableRows = await this.page.$$('tbody.table__group tr.table__row');
    for (const row of tableRows) {
      const cells = await row.$$('td.table__cell');
      list.push({
        description: await cells[0].evaluate(((node) => node.querySelector('a').innerText)),
        date: this.parseDate(await cells[2].evaluate((node) => node.innerText)),
        link: `${await cells[5].evaluate((node) => node.querySelector('a').getAttribute('href'))}`,
        // link: `https://moneybird.com${await cells[5].evaluate((node) => node.querySelector('a').getAttribute('href'))}`,
      });
    }
    return list;
  }

  /**
   * @public
   * @return {Promise<Awaited<{description: *, date: *, download: *, fileName: *}>[]>}
   */
  async fetch() {
    let isAuthenticated = false;
    if (!this.authDone) {
      try {
        isAuthenticated = await this.authenticate();
      } catch (err) {
        this.logger.error('error', err);
      }
    }
    if (!isAuthenticated) {
      throw new Error('authenticationFailed');
    }

    try {
      const invoiceList = await this.getListOfInvoices();
      const invoiceListFiltered = this.applyFilters(invoiceList);

      let currentDownloads = 1;
      const maxDownloads = 15;
      return Promise.all(invoiceListFiltered.map(async (invoice) => {
        while (currentDownloads > maxDownloads) {
          await new Promise((resolve) => { setTimeout(resolve, 300); });
        }
        currentDownloads += 1;
        const download = await this.getDownload(invoice.link);
        this.updateFetchStatus(invoiceListFiltered.length);

        currentDownloads -= 1;

        return {
          ...invoiceListFiltered,
          description: invoice.description,
          date: this.formatDate(invoice.date),
          download,
          fileName: invoice.description,
          wsName: this.ws.name,
        };
      }));
    } catch (err) {
      this.logger.error('Error: ', err.toString());
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @param {String} date
   * @return {Date}
   */
  parseDate(date) {
    const parts = date.split('-');
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }

  /**
   * @private
   * @return {String}
   */
  async getCookie(key) {
    const cookieValue = (await this.page.context()
      .cookies()).filter((cookie) => cookie.name === key)[0].value;
    return `${key}=${cookieValue};`;
  }

  /**
   * @private
   * @param {String} link
   * @param {String} token
   * @return {Object}
   */
  async getDownload(link) {
    let cookies = await this.getCookie('_moneybird_session');
    cookies += (await this.getCookie('mb_online_view_authorization'));

    const myHeaders = new Headers();
    myHeaders.append('cookie', cookies);
    myHeaders.append('accept', '*/*');
    myHeaders.append('Access-Control-Allow-Origin', '*');
    const requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow',
      mode: 'cors',
    };
    const response = await fetch(`https://moneybird.com${link}`, requestOptions);
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

module.exports = MoneybirdPortalProvider;

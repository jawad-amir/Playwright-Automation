/* eslint-disable max-len */
const fs = require('fs/promises');
const Provider = require('./provider');

class ActiveCampaignPartnerProvider extends Provider {
  /**
   * @private
   * @type {string}
   */
  name = 'ActiveCampaign - Partner';

  /**
   * @private
   * @type {string}
   */
  authUrl = 'https://www.activecampaign.com/account/';

  /**
   * @private
   * @type {string}
   */
  invoiceUrl = 'https://www.activecampaign.com/partner/invoices.php';

  /**
   * @private
   * @type {boolean}
   */
  accountId = '';

  /**
   * @public
   * @return {Promise<{ download: *, website: *, description: *}[] | { error: String }>}
   */
  async fetch() {
    await this.authenticate();
    const invoiceList = await this.getInvoiceList();
    const invoiceListNormalized = this.normalizeInvoiceList(invoiceList);
    const invoiceListFiltered = this.applyFilters(invoiceListNormalized);

    try {
      return Promise.all(invoiceListFiltered.map(async (invoice) => {
        const download = await this.getDownload(invoice.link);
        this.updateFetchStatus(invoiceList.length);

        const printUrl = new URL(invoice.link);
        const fileName = invoice.id
          || `__missing_order_id__.${
            printUrl.searchParams.get('id') || printUrl.searchParams.get('p')
          }`;

        return {
          ...invoice,
          date: this.formatDate(invoice.date),
          fileName,
          download,
        };
      }));
    } catch (err) {
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @return {Promise<{id:string, date:string, description:string, wsName:string, wsName:string, href:string }[]>}}
   */
  async getInvoiceList() {
    try {
      await this.page.goto(this.invoiceUrl);
      /**
       * @return {Promise<{date:string, wsName:string, wsName:string, href:string }[]>}}
       */
      const getInvoicesFromNextPages = async () => {
        const pageInvoiceList = await this.page.evaluate((wsName) => {
          const getLastInvoiceRowEl = (rowEl) => (rowEl.textContent.includes('Total:')
            ? rowEl
            : getLastInvoiceRowEl(rowEl.nextElementSibling));
          const getInvoiceListFromElement = (firstRowEl) => {
            const lastInvoiceRowEl = getLastInvoiceRowEl(firstRowEl);
            const { href: printHref } = firstRowEl.querySelector('a');
            const id = firstRowEl.firstElementChild.textContent.split('|')[1].trim();
            const date = firstRowEl.firstElementChild.querySelector('strong').textContent.trim();
            const description = lastInvoiceRowEl.querySelector('td div a').textContent.trim();
            const emptyRowAfterInvoiceEl = lastInvoiceRowEl.nextElementSibling;

            return [
              {
                id, date, wsName, href: printHref, description,
              },
              ...(emptyRowAfterInvoiceEl.nextElementSibling
                ? getInvoiceListFromElement(emptyRowAfterInvoiceEl.nextElementSibling)
                : [])];
          };
          return getInvoiceListFromElement(document.querySelector('.mainbody tr:first-of-type'));
        }, this.ws.name);
        const nextPageLinkSelector = '.paginator a.next';
        if (await this.page.isVisible(nextPageLinkSelector)) {
          await this.page.locator(nextPageLinkSelector).click();
          await this.page.waitForURL();
          return [...pageInvoiceList, ...(await getInvoicesFromNextPages())];
        }
        return pageInvoiceList;
      };
      const invoiceList = await getInvoicesFromNextPages();
      this.onSuccess('Collect invoice list complete', invoiceList);
      return invoiceList;
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('failedToFetchInvoicesFromWebsite');
    }
  }

  /**
   * @private
   * @param {{id:string, date:string, description:string, wsName:string, wsName:string, href:string }[]} invoiceList
   * @return {{id:string, date:Date, description:string, wsName:string, wsName:string, href:string }[]}
   */
  normalizeInvoiceList(invoiceList) {
    return invoiceList.map(({
      id, description, date, href, wsName,
    }) => ({
      id,
      description,
      date: new Date(date),
      link: href,
      wsName,
    }));
  }

  /**
   * @private
   * @param {String} link
   * @return {Object}
   */
  async getDownload(link) {
    const ctx = this.page.context();
    const page = await ctx.newPage();
    try {
      await page.goto(link, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({
        format: 'A4',
        displayHeaderFooter: false,
        margin: {
          top: '10px',
          bottom: '10px',
          left: '10px',
          right: '10px',
        },
      });
      await page.close();
      this.onSuccess('PDF prefetch complete', { link });
      return {
        buffer: Buffer.from(pdf),
        async saveAs(path) {
          await fs.writeFile(path, this.buffer);
        },
      };
    } catch (err) {
      await page.close();
      this.onError(
        new Error(`${link} Request failed.`),
      );
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
      await this.page.locator('#login_ac').click();
      await this.page.locator('input[type="submit"]', { hasText: 'Next' }).click();
      await this.page.waitForURL();
      await this.page.locator('#user').fill(this.ws.username);
      await this.page.locator('#pass').fill(this.ws.password);
      await this.page.locator('input[value="Login"]').click();
      await this.page.waitForURL();
      const invalidLoginInfo = await this.page.getByText('Invalid Login Information.').isVisible();
      if (invalidLoginInfo) {
        throw new Error('Invalid Login Information');
      }
      this.onSuccess('Authentication complete');
    } catch (err) {
      await this.onPageError(err, this.page);
      throw new Error('authenticationFailed');
    }
  }
}

module.exports = ActiveCampaignPartnerProvider;

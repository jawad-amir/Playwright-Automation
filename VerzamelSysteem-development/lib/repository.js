const path = require('path');
const Datastore = require('nedb');
const keytar = require('keytar');
const uuid = require('uuid');

class Repository {
  /**
   * @private
   * @type {string}
   */
  serviceName = 'VerzamelSysteem';

  /**
   * Initialize repository
   * @param {String} [userDataPath] Application data path
   */
  constructor(userDataPath) {
    this.websiteDb = new Datastore({ filename: path.join(userDataPath, 'website.db'), autoload: true });
    this.invoiceDb = new Datastore({ filename: path.join(userDataPath, 'invoice.db'), autoload: true });
    this.settingDb = new Datastore({ filename: path.join(userDataPath, 'setting.db'), autoload: true });
  }

  /**
   * @public
   * @param {Object} [website] Website DTO
   * @param {String} [website.name] Website name
   * @param {String} [website.url] Website url
   * @param {String} [website.username] Website username
   * @param {String} [website.password] Website password
   * @param {String} [website.accountId] Website accountId
   * @return {Promise<Object>}
   */
  async createWebsite(website) {
    const secretUsername = website.username ? await this.createSecret(website.username) : '';
    const secretPassword = website.password ? await this.createSecret(website.password) : '';
    const secretAccountId = website.accountId ? await this.createSecret(website.accountId) : '';
    return new Promise((resolve) => {
      this.websiteDb.insert({
        ...website,
        username: secretUsername,
        password: secretPassword,
        accountId: secretAccountId,
        secured: true,
      }, (err, doc) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(doc);
      });
    });
  }

  /**
   * @private
   * @param {String} _id
   * @return {Promise<Object>}
   */
  getWebsiteById(_id) {
    return new Promise((resolve) => {
      this.websiteDb.findOne({ _id }, (err, doc) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(doc);
      });
    });
  }

  /**
   * @public
   * @param {string} [_id] Website id
   * @return {Promise<{ error: String} | Number>}
   */
  async deleteWebsite(_id) {
    const ws = await this.getWebsiteById(_id);
    if (ws && ws.secured && ws.username) {
      await this.deleteSecret(ws.username);
    }
    if (ws && ws.secured && ws.password) {
      await this.deleteSecret(ws.password);
    }
    if (ws && ws.secured && ws.accountId) {
      await this.deleteSecret(ws.accountId);
    }
    return new Promise((resolve) => {
      this.websiteDb.remove({ _id }, (err, numRemoved) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numRemoved);
      });
    });
  }

  /**
   * @public
   * @return {Promise<Object[]>}
   */
  async getAllWebsites() {
    const websites = await new Promise((resolve) => {
      this.websiteDb.find({}, (err, docs) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(docs);
      });
    });
    return Promise.all(websites.map(async (ws) => {
      const username = ws.username && ws.secured ? await this.getSecret(ws.username) : ws.username;
      const password = ws.password && ws.secured ? await this.getSecret(ws.password) : ws.password;
      const accountId = ws.accountId && ws.secured ? await this.getSecret(ws.accountId) : ws.accountId;
      return {
        ...ws, username, password, accountId,
      };
    }));
  }

  /**
   * @public
   * @param {String} _id
   * @return {Promise<unknown>}
   */
  setWebsiteAuthFailed(_id) {
    return new Promise((resolve) => {
      this.websiteDb.update({ _id }, { $set: { authFailed: true } }, (err, numReplaced) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numReplaced);
      });
    });
  }

  /**
   * @public
   * @param {String} _id
   * @return {Promise<unknown>}
   */
  unsetWebsiteAuthFailed(_id) {
    return new Promise((resolve) => {
      this.websiteDb.update({ _id }, { $unset: { authFailed: true } }, (err, numReplaced) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numReplaced);
      });
    });
  }

  /**
   * @public
   * @param {String} _id
   * @return {Promise<unknown>}
   */
  setWebsiteFetchFailed(_id) {
    return new Promise((resolve) => {
      this.websiteDb.update({ _id }, { $set: { fetchFailed: true } }, (err, numReplaced) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numReplaced);
      });
    });
  }

  /**
   * @public
   * @param {String} _id
   * @return {Promise<unknown>}
   */
  unsetWebsiteFetchFailed(_id) {
    return new Promise((resolve) => {
      this.websiteDb.update({ _id }, { $unset: { fetchFailed: true } }, (err, numReplaced) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numReplaced);
      });
    });
  }

  /**
   * @public
   * @param {Object} [invoice]
   * @param {String} [invoice.description]
   * @param {String} [invoice.date]
   * @param {String} [invoice.wsName]
   * @param {String} [invoice.fileName]
   * @return {Promise<Object>}
   */
  createInvoice(invoice) {
    return new Promise((resolve) => {
      this.invoiceDb.insert(invoice, (err, doc) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(doc);
      });
    });
  }

  /**
   * @public
   * @return {Promise<{ error: String } | Number>}
   */
  deleteAllInvoices() {
    return new Promise((resolve) => {
      this.invoiceDb.remove({}, { multi: true }, (err, numRemoved) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numRemoved);
      });
    });
  }

  /**
   * @public
   * @return {Promise<{ error: String } | Number>}
   */
  bulkDeleteInvoices(ids) {
    return new Promise((resolve) => {
      this.invoiceDb.remove({ $or: ids.map((_id) => ({ _id })) }, {
        multi: true,
      }, (err, numRemoved) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numRemoved);
      });
    });
  }

  /**
   * @public
   * @return {Promise<Object[]>}
   */
  getAllInvoices() {
    return new Promise((resolve) => {
      this.invoiceDb.find({}, (err, docs) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(docs);
      });
    });
  }

  /**
   * @public
   * @return {Promise<Object>}
   */
  getInvoiceById(_id) {
    return new Promise((resolve) => {
      this.invoiceDb.findOne({ _id }, (err, doc) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(doc);
      });
    });
  }

  /**
   * @public
   * @param {Object} [settings]
   * @param {String} [settings.format]
   * @param {String} [settings.dateformat]
   * @param {Boolean} [settings.debugMode]
   * @return {Promise<Object>}
   */
  createSettings(settings) {
    return new Promise((resolve) => {
      this.settingDb.insert(settings, (err, doc) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(doc);
      });
    });
  }

  /**
   * @public
   * @param {Object} [settings]
   * @param {String} [settings.format]
   * @param {String} [settings.dateFormat]
   * @param {String} [settings.licenseKey]
   * @return {Promise<Number>}
   */
  updateSettings(settings) {
    return new Promise((resolve) => {
      this.settingDb.update({}, settings, (err, numReplaced) => {
        if (err) return resolve({ error: 'Datastore error. Something went wrong' });
        return resolve(numReplaced);
      });
    });
  }

  /**
   * @public
   * @return {Promise<Number>}
   */
  countSettings() {
    return new Promise((resolve) => {
      this.settingDb.count({}, (err, count) => {
        if (err) return resolve(0);
        return resolve(count);
      });
    });
  }

  /**
   * @public
   * @return {Promise<Object>}
   */
  getSettings() {
    return new Promise((resolve) => {
      this.settingDb.findOne({}, (err, doc) => {
        if (err) return resolve({ format: '[suggested-filename]' });
        return resolve(doc);
      });
    });
  }

  /**
   * @private
   * @param {String} secret
   * @return {Promise<string|`${string}-${string}-${string}-${string}-${string}`|*>}
   */
  async createSecret(secret) {
    const id = uuid.v4();
    await keytar.setPassword(this.serviceName, id, secret);
    return id;
  }

  /**
   * @private
   * @param {String} id
   * @return {Promise<string | null>}
   */
  async getSecret(id) {
    return keytar.getPassword(this.serviceName, id);
  }

  /**
   * @private
   * @param id
   * @return {Promise<boolean>}
   */
  async deleteSecret(id) {
    return keytar.deletePassword(this.serviceName, id);
  }
}

module.exports = Repository;

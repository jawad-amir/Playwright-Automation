class Websites extends React.Component {
  providerOptions = [];

  constructor(props) {
    super(props);
  }

  async deleteWebsite(id) {
    await window.ipc.deleteWebsite(id);
    this.props.fetchWebsites();
  }

  async fetchProviderOptions() {
    this.providerOptions = await window.ipc.getProviders();
  }

  isDateless(url) {
    const provider = this.providerOptions.find((item) => item.value === url);
    return provider?.dateless;
  }

  async componentDidMount() {
    await this.fetchProviderOptions();
  }

  render() {
    const h = React.createElement;
    const { t } = this.props;
    const { Table, Button } = rsuite;
    const { DeleteFilled, CalendarFilled, WarningFilled } = icons;
    return h(Table, {
      showHeader: true,
      fillHeight: true,
      rowHeight: 38,
      headerHeight: 40,
      renderEmpty: () => h('div', { className: 'rs-table-body-info' }, t('noDataFound')),
      data: this.props.websites,
    }, [
      h(Table.Column, {
        key: 'name',
        width: this.props.columnWidth.name,
        onResize: this.props.setColumnWidth,
        resizable: true,
      }, [
        h(Table.HeaderCell, null, t('websiteName')),
        h(Table.Cell, { dataKey: 'name' }),
      ]),
      h(Table.Column, {
        key: 'url',
        width: this.props.columnWidth.url,
        onResize: this.props.setColumnWidth,
        resizable: true,
      }, [
        h(Table.HeaderCell, null, t('websiteUrl')),
        h(Table.Cell, { dataKey: 'url' }),
      ]),
      h(Table.Column, {
        key: 'actions',
        width: 100,
        align: 'right',
      }, [
        h(Table.HeaderCell, null, ''),
        h(Table.Cell, { className: 'btn-cell' }, (rowData) => ([
          (rowData.authFailed || rowData.fetchFailed) && h('div', { className: 'err-badge-container' }, [
            h(WarningFilled, {
              className: 'provider-badge hint--left',
              'aria-label': rowData.authFailed
                ? t('authenticationFailed', { wsName: rowData.name })
                : t('failedToFetchInvoicesFromWebsite', { wsName: rowData.name }),
            }),
          ]),
          this.isDateless(rowData.url) && h('div', { className: 'fa-provider-badge-container dateless' }, [
            h(CalendarFilled, {
              className: 'fa-provider-badge provider-badge hint--left',
              'aria-label': t('invoiceDateNotAvailable'),
            }),
          ]),
          h(Button, {
            size: 'xs',
            appearance: 'subtle',
            // eslint-disable-next-line no-underscore-dangle
            onClick: () => this.deleteWebsite(rowData._id),
          }, [
            h(DeleteFilled, null),
          ]),
        ])),
      ]),
    ]);
  }
}

window.Websites = Websites;

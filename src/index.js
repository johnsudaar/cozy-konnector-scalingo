const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  // the debug mode shows all the details about http request and responses. Very usefull for
  // debugging but very verbose. That is why it is commented out by default
  // debug: true,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: false,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: true,
  // this allows request-promise to keep cookies between requests
  jar: true
})

const scalingoAuthEndpoint = 'https://auth.scalingo.com/v1/tokens/exchange'
const scalingoApiUrl = 'https://api.scalingo.com/v1'

let scalingoRealToken = null

const baseUrl = 'http://books.toscrape.com'

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  let bearerToken = await authenticate(fields.token)
  log('info', 'Successfully logged in')
  log('info', 'Fetching the list of invoices')
  let options = {
    uri: 'https://api.scalingo.com/v1/account/invoices',
    headers: {
      'Authorization': `Bearer ${ bearerToken }`
    }
  }
  const response = await request(options)
  log('info', response)

  log('info', 'Parsing list of invoices')
  const documents = await parseResponse(response.invoices)

  // here we use the saveBills function even if what we fetch are not bills, but this is the most
  // common case in connectors
  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields.folderPath, {
    // this is a bank identifier which will be used to link bills to bank operations. These
    // identifiers should be at least a word found in the title of a bank operation related to this
    // bill. It is not case sensitive.
    identifiers: ['magic']
  })
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(token) {
  let data = await request.post(`https://:${token}@auth.scalingo.com/v1/tokens/exchange`)
  return data.token
}

// The goal of this function is to parse a html page wrapped by a cheerio instance
// and return an array of js objects which will be saved to the cozy by saveBills (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills)
function parseResponse(invoices) {
  // you can find documentation about the scrape function here :
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  return invoices.map(invoice => ({
    title: invoice.invoice_number,
    amount: invoice.total_price_with_vat,
    fileurl: invoice.pdf_url,
    filename: `${ invoice.billing_month }.pdf`,
    date: invoice.billing_month,
    currency: '€',
    vendor: 'template',
    metadata: {
      // it can be interesting that we add the date of import. This is not mandatory but may be
      // usefull for debugging or data migration
      importDate: new Date(),
      // document version, usefull for migration after change of document structure
      version: 1
    }
  }))
}

// convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('£', '').trim())
}

const StellarSdk = require('stellar-sdk')
const YAML = require('node-yaml')

const configFile = 'config.yml'

const config = YAML.readSync(configFile)

const server = new StellarSdk.Server('https://horizon-testnet.stellar.org')
StellarSdk.Network.useTestNetwork()

const escrowKey = StellarSdk.Keypair.fromSecret(config.accounts.joint_account.secret)
const govKey = StellarSdk.Keypair.fromSecret(config.accounts.gov.secret)
const ngoKey = StellarSdk.Keypair.fromSecret(config.accounts.ngo.secret)
const issuerKey = StellarSdk.Keypair.fromSecret(config.accounts.issuer.secret)
const contractorKey = StellarSdk.Keypair.fromSecret(config.accounts.contractor.secret)

const newAsset = new StellarSdk.Asset(config.token.name, issuerKey.publicKey())

createICOContract()
async function createICOContract () {
  try {
    const escrowAccount = await getEscrowAccount()

    // Create ICO Offer
    await createOffer(escrowAccount)
    const offers = await getOfferId(escrowAccount)
    const offerId = offers.records[0].id

    const sequence = escrowAccount.sequenceNumber()

    console.log('offerId = ', JSON.stringify(offerId, null, 4))
    console.log('sequence = ', JSON.stringify(sequence, null, 4))

    // Create success and fail transaction on N+2 sequence but not submit it
    console.log('Creating claim tx')
    const successTx = await getSuccessTransaction()
    const failTx =  await getFailTransaction(offerId)

    /// / Pre-autorization success and fail tx on N+1 sequence
    await preAuthTransactions(escrowKey, [successTx.hash(), failTx.hash()])
  } catch (error) {
    console.log('error = ', JSON.stringify(error.message, null, 4))
    console.log('error = ', JSON.stringify(error.stack, null, 4))
  }
}

async function getEscrowAccount () {
  return server.loadAccount(escrowKey.publicKey())
}

async function createOffer (escrowAccount) {
  const transaction = new StellarSdk.TransactionBuilder(escrowAccount)
    .addOperation(StellarSdk.Operation.manageOffer({
      selling: newAsset,
      buying: StellarSdk.Asset.native(),
      amount: '100',
      price: 1
    }))
    .build()
  transaction.sign(govKey)
  transaction.sign(ngoKey)
  return server.submitTransaction(transaction)
}

async function getOfferId (escrowAccount) {
  return server.offers('accounts', escrowAccount.accountId()).call()
}

async function getSuccessTransaction () {
  const escrowAccount = await getEscrowAccount()

  // Set sequence number to N+1 for pre-auth transaction
  escrowAccount.incrementSequenceNumber()

  const transaction = new StellarSdk.TransactionBuilder(escrowAccount, {
    timebounds: {
      minTime: parseInt(new Date(config.token.end).getTime() / 1000),
      maxTime: parseInt(new Date(config.token.recovery).getTime() / 1000)
    }
  }).addOperation(StellarSdk.Operation.payment({
    destination: contractorKey.publicKey(),
    asset: StellarSdk.Asset.native(),
    amount: '100'
  })).build()


  console.log('success transaction hash = ', transaction.hash().toString('base64'))
  console.log('XDR = ', decodeURIComponent(transaction.toEnvelope().toXDR().toString("base64")))
  return transaction
}

async function getFailTransaction (offerId) {
  const escrowAccount = await getEscrowAccount()

  // Set sequence number to N+1 for pre-auth transaction
  escrowAccount.incrementSequenceNumber()

  const transaction = new StellarSdk.TransactionBuilder(escrowAccount, {
    timebounds: {
      minTime: parseInt(new Date(config.token.recovery).getTime() / 1000),
      maxTime: 0
    }
  }).addOperation(StellarSdk.Operation.manageOffer({
    // Cancle ICO Offer
      selling: newAsset,
      buying: StellarSdk.Asset.native(),
      amount: '0',
      offerId,
      price: 1
    }))
    // Create offer to claim back donor's fund
    .addOperation(StellarSdk.Operation.manageOffer({
      selling: StellarSdk.Asset.native(),
      buying: newAsset,
      amount: '100',
      price: 1
    }))
    // Send money back to Gov
    .addOperation(StellarSdk.Operation.payment({
      destination: govKey.publicKey(),
      asset: StellarSdk.Asset.native(),
      amount: '100'
    }))
    // Send money back to NGO
    .addOperation(StellarSdk.Operation.payment({
      destination: ngoKey.publicKey(),
      asset: StellarSdk.Asset.native(),
      amount: '100'
    })).build()

  console.log("fail transaction hash = ", transaction.hash().toString('base64'))
  console.log('XDR = ', decodeURIComponent(transaction.toEnvelope().toXDR().toString("base64")))
  return transaction
}

async function preAuthTransactions (escrowKey, preAuthTxHashes) {
  console.log('Pre-authorization transactions')
  // Reload escrow account to get clean sequence number
  const escrowAccount = await server.loadAccount(escrowKey.publicKey())
  const transactionBuilder = new StellarSdk.TransactionBuilder(escrowAccount)

  // Add success and fail transaction to pre-authorization transaction
  for (let i = 0; i < preAuthTxHashes.length; i++) {
    console.log('Adding : ', preAuthTxHashes[i])
    transactionBuilder.addOperation(StellarSdk.Operation.setOptions({
      signer: {
        preAuthTx: preAuthTxHashes[i],
        weight: '1'
      }
    }))
  }

   //Lock account so no further transaction can be submit
   //transactionBuilder.addOperation(StellarSdk.Operation.setOptions({
   //   lowThreshold: 255,
   //   medThreshold: 255,
   //   highThreshold: 255,
   // }))

  const transaction = transactionBuilder.build()

  transaction.sign(govKey)
  transaction.sign(ngoKey)

  return server.submitTransaction(transaction)
}

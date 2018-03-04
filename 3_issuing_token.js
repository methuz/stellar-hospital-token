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

const newAsset = new StellarSdk.Asset(config.token.name, issuerKey.publicKey())

main()

async function main () {
  try {
    await changeEscrowTrust()
    await issuingToken()
    console.log('Success!')
  } catch (error) {
    console.log('error = ', error.message, JSON.stringify(error.stack, null, 4))
  }
}

async function changeEscrowTrust () {
  console.log('Changing escrow trust')
  const escrowAccount = await server.loadAccount(escrowKey.publicKey())
  const transaction = new StellarSdk.TransactionBuilder(escrowAccount)
    .addOperation(StellarSdk.Operation.changeTrust({
      asset: newAsset
    }))
    .build()
  transaction.sign(govKey)
  transaction.sign(ngoKey)
  return server.submitTransaction(transaction)
}

async function issuingToken () {
  console.log('Issuing token')
  const issuerAccount = await server.loadAccount(issuerKey.publicKey())
  const transaction = new StellarSdk.TransactionBuilder(issuerAccount)
    .addOperation(StellarSdk.Operation.payment({
      destination: escrowKey.publicKey(),
      asset: newAsset,
      amount: config.token.max_amount.toString()
    }))
    .build()
  transaction.sign(issuerKey)
  return server.submitTransaction(transaction)
}

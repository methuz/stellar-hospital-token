const StellarSdk = require('stellar-sdk')
const YAML = require('node-yaml')

const configFile = 'config.yml'

const config = YAML.readSync(configFile)

const newKey = StellarSdk.Keypair.random()

console.log('public : ', newKey.publicKey())

var server = new StellarSdk.Server('https://horizon-testnet.stellar.org')
var govKey = StellarSdk.Keypair.fromSecret(config.accounts.gov.secret)
var ngoKey = StellarSdk.Keypair.fromSecret(config.accounts.ngo.secret)

StellarSdk.Network.useTestNetwork()

async function govCreateAccount (startingBalance) {
  startingBalance = typeof startingBalance === 'string' ? startingBalance : startingBalance.toString()
  const govAccount = await server.loadAccount(govKey.publicKey())
  const transaction = new StellarSdk.TransactionBuilder(govAccount)
    .addOperation(StellarSdk.Operation.createAccount({
      destination: newKey.publicKey(),
      startingBalance
    }))
    .build()
  transaction.sign(govKey)
  return server.submitTransaction(transaction)
}

async function setJointAccount () {
  console.log('setting joint account')
  const escrowAccount = await server.loadAccount(newKey.publicKey())
  const transaction = new StellarSdk.TransactionBuilder(escrowAccount)
    .addOperation(StellarSdk.Operation.setOptions({
      signer: {
        ed25519PublicKey: govKey.publicKey(),
        weight: 1
      }
    }))
    .addOperation(StellarSdk.Operation.setOptions({
      masterWeight: 0,
      lowThreshold: 2,
      medThreshold: 2,
      highThreshold: 2,
      signer: {
        ed25519PublicKey: ngoKey.publicKey(),
        weight: 1
      }
    }))
    .build()
  transaction.sign(newKey)
  return server.submitTransaction(transaction)
}

async function sendFund (from, to, amount) {
  amount = typeof amount === 'string' ? amount : amount.toString()
  const fromAccount = await server.loadAccount(from.publicKey())
  const transaction = new StellarSdk.TransactionBuilder(fromAccount)
    .addOperation(StellarSdk.Operation.payment({
      destination: to.publicKey(),
      asset: StellarSdk.Asset.native(),
      amount
    }))
    .build()
  transaction.sign(from)
  return server.submitTransaction(transaction)
}

async function getEscrowAccount () {
  try {
    saveConfigSync()
    await govCreateAccount(5)
    await setJointAccount()
    await sendFund(ngoKey, newKey, 100)
    await sendFund(govKey, newKey, 100)
    console.log('Setting escrow account success!!')
  } catch (error) {
    console.log('error = ', JSON.stringify(error, null, 4))
  }
}

function saveConfigSync () {
  config['accounts']['joint_account'] = {
    public: newKey.publicKey(),
    secret: newKey.secret()
  }
  YAML.writeSync(configFile, config)
}

getEscrowAccount()

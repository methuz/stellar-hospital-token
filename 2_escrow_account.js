const StellarSdk = require('stellar-sdk');
const YAML = require('node-yaml');

const configFile = 'config.yml';

const config = YAML.readSync(configFile);

const newKey = StellarSdk.Keypair.random();
const startingFund = "100";

console.log("public : ", newKey.publicKey());

var server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
var govKey = StellarSdk.Keypair.fromSecret(config.accounts.gov.secret);
var ngoKey = StellarSdk.Keypair.fromSecret(config.accounts.ngo.secret);

StellarSdk.Network.useTestNetwork();

function govCreateAccount() {
  console.log("creating account");
  return server.loadAccount(govKey.publicKey()).then(function(govAccount) {
    const transaction = new StellarSdk.TransactionBuilder(govAccount)
      .addOperation(StellarSdk.Operation.createAccount({
        destination: newKey.publicKey(),
        startingBalance: startingFund
      }))
      .build();
    transaction.sign(govKey);
    return server.submitTransaction(transaction);
  })
}

function setJointAccount() {
  console.log("Set Join Account");
  return server.loadAccount(newKey.publicKey()).then(function(escrowAccount) {
    const transaction = new StellarSdk.TransactionBuilder(escrowAccount)
      .addOperation(StellarSdk.Operation.setOptions({
        signer: {
          ed25519PublicKey: govKey.publicKey(),
          weight: 1
        },
      }))
      .addOperation(StellarSdk.Operation.setOptions({
        masterWeight: 0,
        lowThreshold: 2,
        medThreshold: 2,
        highThreshold: 2,
        signer: {
          ed25519PublicKey: ngoKey.publicKey(),
          weight: 1
        },
      }))
      .build();
    transaction.sign(newKey);
    return server.submitTransaction(transaction);
  })
}

function ngoSendFund() {
  console.log("NGO send fund");
  return server.loadAccount(ngoKey.publicKey()).then(function(ngoAccount) {
    const transaction = new StellarSdk.TransactionBuilder(ngoAccount)
      .addOperation(StellarSdk.Operation.payment({
        destination: newKey.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: startingFund
      }))
      .build();
    transaction.sign(ngoKey);
    return server.submitTransaction(transaction);
  })
}

async function getEscrowAccount() {
  try {
    saveConfig()
    await govCreateAccount()
    await setJointAccount()
    await ngoSendFund()
  } catch (error) {
    console.log("error = ", JSON.stringify(error, null, 4));
  }
}

function saveConfig() {
  config['accounts']['joint_account'] = {
    public: newKey.publicKey(),
    secret: newKey.secret()
  }
  YAML.writeSync(configFile, config)
}

getEscrowAccount()

const StellarSdk = require('stellar-sdk');
const YAML = require('yamljs');

const config = YAML.load('config.yml');

const pair = StellarSdk.Keypair.random();

console.log("public : ", pair.publicKey());
console.log("secret : ", pair.secret());

var server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
var masterKey = StellarSdk.Keypair.fromSecret(config.accounts.master.secret);
StellarSdk.Network.useTestNetwork();

server.loadAccount(masterKey.publicKey()).then(function(masterAccount) {
  transaction = new StellarSdk.TransactionBuilder(masterAccount)
    .addOperation(StellarSdk.Operation.createAccount({
      destination: pair.publicKey(),
      startingBalance : "100"
    }))
    .build();
  transaction.sign(masterKey);
  return server.submitTransaction(transaction);
}).then(function(result) {
  console.log('Success! Results:', result);
}).catch(function(error) {
  console.error('Something went wrong', error);
})

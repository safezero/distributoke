const solc = require('solc')
const amorphParseSolcOuput = require('amorph-parse-solc-output')
const Amorph = require('amorph')
const fs = require('fs')

const solcOutput = solc.compile({
  sources: {
    'Distributoken.sol': fs.readFileSync('./contracts/Distributoken.sol', 'utf8'),
    'Twofa.sol': fs.readFileSync('./node_modules/eth-twofa/Twofa.sol', 'utf8'),
    'HumanStandardToken.sol': fs.readFileSync('./contracts/HumanStandardToken.sol', 'utf8'),
    'StandardToken.sol': fs.readFileSync('./contracts/StandardToken.sol', 'utf8'),
    'Token.sol': fs.readFileSync('./contracts/Token.sol', 'utf8')
  }
})

module.exports = amorphParseSolcOuput(solcOutput, Amorph)['Distributoken.sol:Distributoken']

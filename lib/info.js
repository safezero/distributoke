const solc = require('solc')
const amorphParseSolcOuput = require('amorph-parse-solc-output')
const Amorph = require('amorph')
const fs = require('fs')
const path = require('path')

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath),  'utf8')
}

const solcOutput = solc.compile({
  sources: {
    'Distributoken.sol': read('../contracts/Distributoken.sol'),
    'Twofa.sol': read('../node_modules/eth-twofa/Twofa.sol'),
    'HumanStandardToken.sol': read('../contracts/HumanStandardToken.sol'),
    'StandardToken.sol': read('../contracts/StandardToken.sol'),
    'Token.sol': read('../contracts/Token.sol')
  }
})

module.exports = amorphParseSolcOuput(solcOutput, Amorph)['Distributoken.sol:Distributoken']
